import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	type ComposeMode,
	type DraftContent,
	type DraftView,
	MAX_TOTAL_ATTACHMENT_BYTES,
	MAX_UPLOAD_BYTES,
	type SendResponse,
	type UploadView,
} from "@postscript/types";
import { and, eq } from "drizzle-orm";
import type { AuthCtx } from "../common/auth";
import { ContentCache } from "../common/content-cache";
import { orgCipher } from "../common/crypto";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { DB, type Db } from "../db/db";
import { type Draft, drafts, type Mailbox, mailboxFolders, outbox, threads } from "../db/schema";
import { QueueService } from "../queue/queue.service";
import { parseSource } from "./body";
import * as gmail from "./gmail.client";
import { fetchSource, sendSmtp, withFolder, withImap } from "./imap.client";
import type { Envelope } from "./ingest.service";
import { MailboxService, type MailScope } from "./mailbox.service";
import {
	buildMime,
	escapeHtml,
	formatAddress,
	forwardSubject,
	type OutgoingAttachment,
	replyAllRecipients,
	replySubject,
	textToHtml,
} from "./mime";
import { ReadService } from "./read.service";
import { sanitizeEmailHtml } from "./sanitize";
import { SyncService } from "./sync.service";

export const UNDO_SECONDS = 10;

interface ForwardRef {
	id: string;
	messageId: string;
	attachmentId: string;
	filename: string;
	size: number;
}

/** Everything about an unsent message. Lives encrypted in Redis only. */
interface StoredDraft {
	content: DraftContent;
	forwards: ForwardRef[];
	inReplyTo: string | null;
	references: string[];
	/** Provider draft to delete when the From mailbox changed. */
	stale?: { mailboxId: string; ref: string } | null;
}

interface UploadMeta extends UploadView {}

const uploadSlot = (userId: string) => `u-${userId}`;

@Injectable()
export class ComposeService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly boxes: MailboxService,
		private readonly read: ReadService,
		private readonly cache: ContentCache,
		private readonly queues: QueueService,
		private readonly sync: SyncService,
	) {}

	// ─── Uploads ────────────────────────────────────────────────────────────
	async upload(ctx: AuthCtx, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }): Promise<UploadView> {
		if (!file?.buffer?.length) throw new ApiError(400, "Choose a file to attach", "invalid_input");
		if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "That file is too big. The limit is 15 MB.", "too_large");
		const id = randomBytes(9).toString("base64url");
		const meta: UploadMeta = {
			id,
			filename: file.originalname.replace(/[\r\n"]/g, "").slice(0, 200) || "file",
			mimeType: file.mimetype || "application/octet-stream",
			size: file.size,
		};
		await this.cache.putBuffer(ctx.orgId, uploadSlot(ctx.userId), "up", id, file.buffer);
		await this.cache.put(ctx.orgId, uploadSlot(ctx.userId), "upm", id, meta);
		return meta;
	}

	private async uploadMeta(orgId: string, userId: string, ids: string[]): Promise<UploadMeta[]> {
		const out: UploadMeta[] = [];
		for (const id of ids) {
			const m = await this.cache.get<UploadMeta>(orgId, uploadSlot(userId), "upm", id);
			if (m) out.push(m);
		}
		return out;
	}

	// ─── Drafts ─────────────────────────────────────────────────────────────
	private async requireDraft(scope: MailScope, id: string): Promise<Draft> {
		const [d] = await this.db
			.select()
			.from(drafts)
			.where(and(eq(drafts.id, id), eq(drafts.organizationId, scope.orgId), eq(drafts.userId, scope.userId)))
			.limit(1);
		if (!d) throw new ApiError(404, "Draft not found", "draft_not_found");
		return d;
	}

	private signature(mb: Mailbox): string {
		return mb.signatureHtml ? `<p></p><div class="ps-signature">${mb.signatureHtml}</div>` : "";
	}

	/** Create a draft, prefilled for reply / reply all / forward / edit. */
	async create(ctx: AuthCtx, input: { mailboxId?: string; mode: ComposeMode; sourceMessageId?: string }): Promise<DraftView> {
		const scope = { orgId: ctx.orgId, userId: ctx.userId };
		let mb: Mailbox | null = null;
		const stored: StoredDraft = {
			content: { mailboxId: "", to: [], cc: [], bcc: [], subject: "", html: "", uploadIds: [], forwardAttachmentIds: [] },
			forwards: [],
			inReplyTo: null,
			references: [],
		};
		let threadId: string | null = null;
		let providerDraftRef: string | null = null;
		let sourceMessageId: string | null = null;

		if (input.mode !== "new") {
			if (!input.sourceMessageId) throw new ApiError(400, "sourceMessageId is required", "invalid_input");
			const { m, mb: srcBox } = await this.read.requireMessage(scope, input.sourceMessageId);
			mb = srcBox;
			sourceMessageId = m.id;
			const env = orgCipher(ctx.orgId).dec<Envelope>(m.envelopeEnc);
			const body = await this.read.fetchBody(srcBox, m);
			if (!body) throw new ApiError(502, "Could not load the original message from your mail server. Try again.", "provider_unavailable");
			const quotedHtml = body.html
				? sanitizeEmailHtml(body.html, { allowRemoteImages: true }).html
				: textToHtml(body.text ?? "");
			const fromLine = env?.from ? escapeHtml(formatAddress(env.from)) : "someone";
			const dateLine = m.internalDate ? m.internalDate.toUTCString() : "";
			const forwards = body.attachments.map((a) => ({
				id: `${m.id}.${a.id}`,
				messageId: m.id,
				attachmentId: a.id,
				filename: a.filename,
				size: a.size,
			}));

			if (input.mode === "edit") {
				if (!m.isDraft) throw new ApiError(400, "Only drafts can be edited", "invalid_input");
				const raw = await this.providerDraftSource(srcBox, m);
				const parsed = raw ? await parseSource(raw) : null;
				stored.content = {
					...stored.content,
					to: parsed?.to ?? env?.to.map((a) => a.address) ?? [],
					cc: parsed?.cc ?? env?.cc.map((a) => a.address) ?? [],
					bcc: parsed?.bcc ?? env?.bcc.map((a) => a.address) ?? [],
					subject: parsed?.subject ?? env?.subject ?? "",
					html: parsed?.html ? sanitizeEmailHtml(parsed.html, { allowRemoteImages: true }).html : textToHtml(parsed?.text ?? body.text ?? ""),
				};
				stored.forwards = forwards;
				stored.content.forwardAttachmentIds = forwards.map((f) => f.id);
				stored.references = body.references;
				providerDraftRef = await this.providerDraftRefFor(srcBox, m);
				threadId = m.threadId;
			} else if (input.mode === "forward") {
				stored.content.subject = forwardSubject(env?.subject);
				stored.content.html = `<p></p>${this.signature(srcBox)}<p></p><div class="ps-forward"><p>---------- Forwarded message ----------<br>From: ${fromLine}<br>Date: ${escapeHtml(dateLine)}<br>Subject: ${escapeHtml(env?.subject ?? "")}<br>To: ${escapeHtml((env?.to ?? []).map(formatAddress).join(", "))}</p>${quotedHtml}</div>`;
				stored.forwards = forwards.filter((f) => !body.attachments.find((a) => a.id === f.attachmentId)?.inline);
				stored.content.forwardAttachmentIds = stored.forwards.map((f) => f.id);
			} else {
				const me = srcBox.emailAddress;
				if (input.mode === "replyAll") {
					const r = replyAllRecipients({ me, from: env?.from ?? null, replyTo: env?.replyTo ?? null, to: env?.to ?? [], cc: env?.cc ?? [] });
					stored.content.to = r.to;
					stored.content.cc = r.cc;
				} else {
					const target = env?.replyTo ?? env?.from;
					const fromIsMe = target?.address === me;
					stored.content.to = fromIsMe ? (env?.to ?? []).map((a) => a.address) : target ? [target.address] : [];
				}
				stored.content.subject = replySubject(env?.subject);
				stored.content.html = `<p></p>${this.signature(srcBox)}<p></p><div class="ps-quote"><p>On ${escapeHtml(dateLine)}, ${fromLine} wrote:</p><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${quotedHtml}</blockquote></div>`;
				const msgId = body.messageId ?? env?.messageId ?? null;
				stored.inReplyTo = msgId;
				stored.references = [...body.references, ...(msgId ? [msgId] : [])].slice(-20);
				threadId = m.threadId;
			}
		} else {
			const list = await this.boxes.list(scope);
			mb = input.mailboxId ? await this.boxes.require(scope, input.mailboxId) : (list[0] ?? null);
			if (!mb) throw new ApiError(400, "Connect a mailbox first", "no_mailbox");
			stored.content.html = this.signature(mb);
		}
		if (input.mailboxId && input.mode !== "new" && input.mailboxId !== mb.id) {
			mb = await this.boxes.require(scope, input.mailboxId);
			threadId = null;
		}
		stored.content.mailboxId = mb.id;

		const [d] = await this.db
			.insert(drafts)
			.values({
				organizationId: ctx.orgId,
				userId: ctx.userId,
				mailboxId: mb.id,
				mode: input.mode,
				sourceMessageId,
				threadId,
				providerDraftRef,
				version: 1,
				syncedVersion: providerDraftRef ? 1 : 0,
			})
			.returning();
		await this.cache.put(ctx.orgId, mb.id, "d", d.id, stored);
		return this.view(ctx, d, stored);
	}

	private async view(ctx: AuthCtx, d: Draft, s: StoredDraft): Promise<DraftView> {
		return {
			id: d.id,
			mode: d.mode as ComposeMode,
			mailboxId: d.mailboxId,
			threadId: d.threadId,
			sourceMessageId: d.sourceMessageId,
			to: s.content.to,
			cc: s.content.cc,
			bcc: s.content.bcc,
			subject: s.content.subject,
			html: s.content.html,
			uploads: await this.uploadMeta(ctx.orgId, ctx.userId, s.content.uploadIds),
			forwardAttachments: s.forwards
				.filter((f) => s.content.forwardAttachmentIds.includes(f.id))
				.map((f) => ({ id: f.id, filename: f.filename, size: f.size })),
			version: d.version,
			updatedAt: d.updatedAt.toISOString(),
		};
	}

	async get(ctx: AuthCtx, id: string): Promise<DraftView> {
		const d = await this.requireDraft(ctx, id);
		let s = await this.cache.get<StoredDraft>(ctx.orgId, d.mailboxId, "d", d.id);
		if (!s) s = await this.loadFromProvider(d);
		if (!s) throw new ApiError(404, "This draft is no longer available", "draft_not_found");
		return this.view(ctx, d, s);
	}

	async save(ctx: AuthCtx, id: string, content: DraftContent): Promise<{ version: number }> {
		const d = await this.requireDraft(ctx, id);
		const mb = await this.boxes.require(ctx, content.mailboxId);
		const prev = (await this.cache.get<StoredDraft>(ctx.orgId, d.mailboxId, "d", d.id)) ?? (await this.loadFromProvider(d));
		const stored: StoredDraft = {
			content,
			forwards: prev?.forwards ?? [],
			inReplyTo: prev?.inReplyTo ?? null,
			references: prev?.references ?? [],
			stale: prev?.stale ?? null,
		};
		if (mb.id !== d.mailboxId) {
			if (d.providerDraftRef) stored.stale = { mailboxId: d.mailboxId, ref: d.providerDraftRef };
			await this.cache.del(ctx.orgId, d.mailboxId, "d", d.id);
		}
		const [row] = await this.db
			.update(drafts)
			.set({
				version: d.version + 1,
				mailboxId: mb.id,
				...(mb.id !== d.mailboxId ? { providerDraftRef: null, syncedVersion: 0, threadId: null } : {}),
			})
			.where(eq(drafts.id, d.id))
			.returning();
		await this.cache.put(ctx.orgId, mb.id, "d", d.id, stored);
		await this.queues.safe("draft-sync", () => this.queues.draftSync(d.id, row.version));
		return { version: row.version };
	}

	async remove(ctx: AuthCtx, id: string): Promise<void> {
		const d = await this.requireDraft(ctx, id);
		await this.deleteProviderDraft(d.mailboxId, d.providerDraftRef).catch((err) => log.warn("draft.provider_delete_failed", { err }));
		await this.cache.del(ctx.orgId, d.mailboxId, "d", d.id);
		await this.db.delete(drafts).where(eq(drafts.id, d.id));
	}

	// ─── Send with undo ─────────────────────────────────────────────────────
	async send(ctx: AuthCtx, id: string, content: DraftContent): Promise<SendResponse> {
		const d = await this.requireDraft(ctx, id);
		const mb = await this.boxes.require(ctx, content.mailboxId);
		if (!content.to.length && !content.cc.length && !content.bcc.length) {
			throw new ApiError(400, "Add at least one recipient", "no_recipients");
		}
		const prev = (await this.cache.get<StoredDraft>(ctx.orgId, d.mailboxId, "d", d.id)) ?? (await this.loadFromProvider(d));
		const forwards = (prev?.forwards ?? []).filter((f) => content.forwardAttachmentIds.includes(f.id));
		const uploads = await this.uploadMeta(ctx.orgId, ctx.userId, content.uploadIds);
		if (uploads.length !== content.uploadIds.length) {
			throw new ApiError(400, "An attachment expired. Please attach it again.", "upload_expired");
		}
		const total = uploads.reduce((s, u) => s + u.size, 0) + forwards.reduce((s, f) => s + f.size, 0);
		if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw new ApiError(413, "Attachments are over 25 MB in total.", "too_large");

		const sendAt = new Date(Date.now() + UNDO_SECONDS * 1000);
		const [ob] = await this.db
			.insert(outbox)
			.values({ organizationId: ctx.orgId, userId: ctx.userId, mailboxId: mb.id, draftId: d.id, status: "queued", sendAt })
			.returning();
		const payload: StoredDraft = {
			content,
			forwards,
			inReplyTo: d.mailboxId === mb.id ? (prev?.inReplyTo ?? null) : null,
			references: d.mailboxId === mb.id ? (prev?.references ?? []) : [],
			stale: prev?.stale ?? null,
		};
		await this.cache.put(ctx.orgId, mb.id, "ob", ob.id, payload);
		await this.cache.put(ctx.orgId, mb.id, "d", d.id, payload);
		await this.queues.send(ob.id, UNDO_SECONDS * 1000);
		return { outboxId: ob.id, sendAt: sendAt.toISOString(), undoSeconds: UNDO_SECONDS };
	}

	async undo(ctx: AuthCtx, outboxId: string): Promise<{ draftId: string }> {
		const [ob] = await this.db
			.update(outbox)
			.set({ status: "canceled" })
			.where(
				and(eq(outbox.id, outboxId), eq(outbox.organizationId, ctx.orgId), eq(outbox.userId, ctx.userId), eq(outbox.status, "queued")),
			)
			.returning();
		if (!ob || !ob.draftId) throw new ApiError(409, "Too late to undo. The message was sent.", "too_late");
		await this.queues.cancelSend(ob.id);
		await this.cache.del(ctx.orgId, ob.mailboxId, "ob", ob.id);
		return { draftId: ob.draftId };
	}

	/** Worker: send one outbox message (idempotent claim, safe to retry). */
	async deliver(outboxId: string, finalAttempt: boolean): Promise<void> {
		const [ob] = await this.db
			.update(outbox)
			.set({ status: "sending" })
			.where(and(eq(outbox.id, outboxId), eq(outbox.status, "queued")))
			.returning();
		if (!ob) return; // canceled, or already handled
		const mb = await this.boxes.byId(ob.mailboxId);
		const payload = mb ? await this.cache.get<StoredDraft>(ob.organizationId, mb.id, "ob", ob.id) : null;
		if (!mb || !payload) {
			await this.db.update(outbox).set({ status: "failed", error: "Message content expired before sending" }).where(eq(outbox.id, ob.id));
			return;
		}
		let sent = false;
		try {
			const attachments = await this.collectAttachments(ob.organizationId, ob.userId, payload);
			const domain = mb.emailAddress.split("@")[1] ?? "postscript.local";
			const messageId = `${randomBytes(12).toString("hex")}@${domain}`;
			const from = { name: mb.displayName, address: mb.emailAddress };
			const base = {
				from,
				to: payload.content.to,
				cc: payload.content.cc,
				bcc: payload.content.bcc,
				subject: payload.content.subject,
				html: payload.content.html || "<p></p>",
				inReplyTo: payload.inReplyTo,
				references: payload.references,
				attachments,
				messageId,
			};
			const draft = ob.draftId ? (await this.db.select().from(drafts).where(eq(drafts.id, ob.draftId)).limit(1))[0] : undefined;

			if (mb.provider === "gmail") {
				const token = await this.boxes.gmailToken(mb);
				let gThread: string | null = null;
				if (draft?.threadId) {
					const [t] = await this.db.select().from(threads).where(eq(threads.id, draft.threadId)).limit(1);
					if (t?.mailboxId === mb.id) gThread = t.providerThreadId;
				}
				const raw = await buildMime({ ...base, keepBcc: true });
				const res = await gmail.sendRaw(token, raw, gThread);
				sent = true;
				await this.db.update(outbox).set({ status: "sent", sentAt: new Date() }).where(eq(outbox.id, ob.id));
				await this.sync.gmailIngestOne(mb, res.id).catch(() => undefined);
			} else {
				const cfg = this.boxes.imapConfig(mb);
				const raw = await buildMime(base);
				await sendSmtp(cfg, raw, { from: mb.emailAddress, to: [...base.to, ...base.cc, ...base.bcc] });
				sent = true;
				await this.db.update(outbox).set({ status: "sent", sentAt: new Date() }).where(eq(outbox.id, ob.id));
				await this.appendToSent(mb, raw).catch((err) => log.warn("send.append_sent_failed", { err }));
			}
			// Clean up: provider draft, local draft, cached content.
			if (draft) {
				await this.deleteProviderDraft(draft.mailboxId, draft.providerDraftRef).catch(() => undefined);
				await this.cache.del(ob.organizationId, draft.mailboxId, "d", draft.id);
				await this.db.delete(drafts).where(eq(drafts.id, draft.id));
			}
			if (payload.stale) await this.deleteProviderDraft(payload.stale.mailboxId, payload.stale.ref).catch(() => undefined);
			for (const u of payload.content.uploadIds) {
				await this.cache.del(ob.organizationId, uploadSlot(ob.userId), "up", u);
				await this.cache.del(ob.organizationId, uploadSlot(ob.userId), "upm", u);
			}
			await this.cache.del(ob.organizationId, mb.id, "ob", ob.id);
			log.info("send.done", { outboxId: ob.id, mailboxId: mb.id });
		} catch (err) {
			if (sent) {
				log.warn("send.post_send_step_failed", { outboxId: ob.id, err: err as Error });
				return;
			}
			const message = err instanceof ApiError ? err.message : "Sending failed";
			await this.db
				.update(outbox)
				.set({ status: finalAttempt ? "failed" : "queued", error: message })
				.where(eq(outbox.id, ob.id));
			throw err;
		}
	}

	private async collectAttachments(orgId: string, userId: string, s: StoredDraft): Promise<OutgoingAttachment[]> {
		const out: OutgoingAttachment[] = [];
		for (const meta of await this.uploadMeta(orgId, userId, s.content.uploadIds)) {
			const content = await this.cache.getBuffer(orgId, uploadSlot(userId), "up", meta.id);
			if (!content) throw new ApiError(400, "An attachment expired. Please attach it again.", "upload_expired");
			out.push({ filename: meta.filename, contentType: meta.mimeType, content });
		}
		for (const f of s.forwards) {
			const a = await this.read.attachmentContent(f.messageId, f.attachmentId);
			out.push({ filename: a.filename, contentType: a.mimeType, content: a.content });
		}
		return out;
	}

	private async roleFolder(mailboxId: string, role: string): Promise<string | null> {
		const [f] = await this.db
			.select()
			.from(mailboxFolders)
			.where(and(eq(mailboxFolders.mailboxId, mailboxId), eq(mailboxFolders.role, role)))
			.limit(1);
		return f?.providerId ?? null;
	}

	private async appendToSent(mb: Mailbox, raw: Buffer) {
		const path = (await this.roleFolder(mb.id, "sent")) ?? "Sent";
		await withImap(this.boxes.imapConfig(mb), async (c) => {
			const res = await c.append(path, raw, ["\\Seen"]);
			const uid = res && typeof res === "object" ? Number((res as { uid?: number }).uid) : 0;
			if (uid) await this.sync.imapIngestUids(mb, c, path, [uid]);
		});
	}

	// ─── Provider drafts (worker) ───────────────────────────────────────────
	async syncDraft(draftId: string): Promise<void> {
		const [d] = await this.db.select().from(drafts).where(eq(drafts.id, draftId)).limit(1);
		if (!d || d.version <= d.syncedVersion) return;
		const mb = await this.boxes.byId(d.mailboxId);
		if (!mb) return;
		const s = await this.cache.get<StoredDraft>(d.organizationId, mb.id, "d", d.id);
		if (!s) return;
		if (s.stale) {
			await this.deleteProviderDraft(s.stale.mailboxId, s.stale.ref).catch(() => undefined);
			s.stale = null;
			await this.cache.put(d.organizationId, mb.id, "d", d.id, s);
		}
		const uploads: OutgoingAttachment[] = [];
		for (const meta of await this.uploadMeta(d.organizationId, d.userId, s.content.uploadIds)) {
			const content = await this.cache.getBuffer(d.organizationId, uploadSlot(d.userId), "up", meta.id);
			if (content) uploads.push({ filename: meta.filename, contentType: meta.mimeType, content });
		}
		const raw = await buildMime({
			from: { name: mb.displayName, address: mb.emailAddress },
			to: s.content.to,
			cc: s.content.cc,
			bcc: s.content.bcc,
			subject: s.content.subject,
			html: s.content.html || "<p></p>",
			inReplyTo: s.inReplyTo,
			references: s.references,
			attachments: uploads,
			keepBcc: true,
		});
		let ref = d.providerDraftRef;
		if (mb.provider === "gmail") {
			const token = await this.boxes.gmailToken(mb);
			let gThread: string | null = null;
			if (d.threadId) {
				const [t] = await this.db.select().from(threads).where(eq(threads.id, d.threadId)).limit(1);
				gThread = t?.providerThreadId ?? null;
			}
			const res = ref ? await gmail.updateDraft(token, ref, raw, gThread).catch(() => gmail.createDraft(token, raw, gThread)) : await gmail.createDraft(token, raw, gThread);
			ref = res.id;
		} else {
			const path = (await this.roleFolder(mb.id, "drafts")) ?? "Drafts";
			ref = await withImap(this.boxes.imapConfig(mb), async (c) => {
				const res = await c.append(path, raw, ["\\Draft", "\\Seen"]);
				const uid = res && typeof res === "object" ? Number((res as { uid?: number }).uid) : 0;
				if (d.providerDraftRef) {
					const [oldPath, oldUid] = d.providerDraftRef.split("|");
					await withFolder(c, oldPath, () => c.messageDelete(oldUid, { uid: true })).catch(() => undefined);
				}
				return uid ? `${path}|${uid}` : null;
			});
		}
		await this.db.update(drafts).set({ providerDraftRef: ref, syncedVersion: d.version }).where(eq(drafts.id, d.id));
	}

	private async deleteProviderDraft(mailboxId: string, ref: string | null) {
		if (!ref) return;
		const mb = await this.boxes.byId(mailboxId);
		if (!mb) return;
		if (mb.provider === "gmail") {
			await gmail.deleteDraft(await this.boxes.gmailToken(mb), ref);
		} else {
			const [path, uid] = ref.split("|");
			await withImap(this.boxes.imapConfig(mb), (c) => withFolder(c, path, () => c.messageDelete(uid, { uid: true })));
		}
	}

	private async providerDraftRefFor(mb: Mailbox, m: { providerMessageId: string; folder: string | null; uid: number | null }) {
		if (mb.provider === "gmail") return gmail.findDraftIdForMessage(await this.boxes.gmailToken(mb), m.providerMessageId);
		return m.folder && m.uid ? `${m.folder}|${m.uid}` : null;
	}

	private async providerDraftSource(mb: Mailbox, m: { providerMessageId: string; folder: string | null; uid: number | null }) {
		if (mb.provider === "gmail") {
			const r = await gmail.getMessageRaw(await this.boxes.gmailToken(mb), m.providerMessageId);
			return r.raw ? Buffer.from(r.raw, "base64url") : null;
		}
		if (!m.folder || !m.uid) return null;
		return withImap(this.boxes.imapConfig(mb), (c) => withFolder(c, m.folder as string, () => fetchSource(c, m.uid as number)));
	}

	/** Rebuild a draft's content from the provider after the cache expired. */
	private async loadFromProvider(d: Draft): Promise<StoredDraft | null> {
		if (!d.providerDraftRef) return null;
		const mb = await this.boxes.byId(d.mailboxId);
		if (!mb) return null;
		let raw: Buffer | null = null;
		try {
			if (mb.provider === "gmail") {
				const r = await gmail.getDraftRaw(await this.boxes.gmailToken(mb), d.providerDraftRef);
				raw = r.message.raw ? Buffer.from(r.message.raw, "base64url") : null;
			} else {
				const [path, uid] = d.providerDraftRef.split("|");
				raw = await withImap(this.boxes.imapConfig(mb), (c) => withFolder(c, path, () => fetchSource(c, Number(uid))));
			}
		} catch (err) {
			log.warn("draft.load_failed", { draftId: d.id, err: err as Error });
		}
		if (!raw) return null;
		const p = await parseSource(raw);
		const s: StoredDraft = {
			content: {
				mailboxId: mb.id,
				to: p.to,
				cc: p.cc,
				bcc: p.bcc,
				subject: p.subject ?? "",
				html: p.html ? sanitizeEmailHtml(p.html, { allowRemoteImages: true }).html : textToHtml(p.text ?? ""),
				uploadIds: [],
				forwardAttachmentIds: [],
			},
			forwards: [],
			inReplyTo: null,
			references: p.references,
		};
		await this.cache.put(d.organizationId, mb.id, "d", d.id, s);
		return s;
	}
}
