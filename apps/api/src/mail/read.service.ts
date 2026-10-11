import { Inject, Injectable } from "@nestjs/common";
import type {
	Address,
	AttachmentView,
	FolderRole,
	MessageView,
	ThreadDetail,
	ThreadListItem,
	ThreadListResponse,
	ThreadsQuery,
} from "@postscript/types";
import { threadsQuerySchema } from "@postscript/types";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { ContentCache } from "../common/content-cache";
import { orgCipher } from "../common/crypto";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { DB, type Db } from "../db/db";
import { type Mailbox, mailboxes, mailboxFolders, type Message, messages, threads } from "../db/schema";
import * as gmail from "./gmail.client";
import { attachmentUrl, findGmailPart, type LiveBody, parseGmailPayload, parseSource } from "./body";
import { fetchSource, withFolder, withImap } from "./imap.client";
import type { Envelope } from "./ingest.service";
import { type MailScope, MailboxService } from "./mailbox.service";
import { displayName } from "./mime";
import { sanitizeEmailHtml } from "./sanitize";

const CATEGORY_LABELS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS"];

function categoryOf(labels: string[] | null): ThreadListItem["category"] {
	if (!labels) return "primary";
	if (labels.includes("CATEGORY_PROMOTIONS")) return "promotions";
	if (labels.includes("CATEGORY_SOCIAL")) return "social";
	if (labels.includes("CATEGORY_UPDATES")) return "updates";
	return "primary";
}

type Row = Pick<
	Message,
	"id" | "threadId" | "mailboxId" | "envelopeEnc" | "isUnread" | "isStarred" | "isDraft" | "hasAttachments" | "roles" | "labels" | "internalDate"
>;

@Injectable()
export class ReadService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly boxes: MailboxService,
		private readonly cache: ContentCache,
	) {}

	// ─── Lists ──────────────────────────────────────────────────────────────
	async listThreads(scope: MailScope, raw: ThreadsQuery): Promise<ThreadListResponse> {
		const q = threadsQuerySchema.parse(raw);
		const conds: SQL[] = [];
		let threadCond: SQL = sql`true`;
		switch (q.view) {
			case "inbox":
				conds.push(sql`m.roles ? 'inbox'`);
				threadCond = sql`(t.snoozed_until is null or t.snoozed_until <= now())`;
				break;
			case "starred":
				conds.push(sql`m.is_starred and not (m.roles ?| array['trash','spam'])`);
				break;
			case "snoozed":
				threadCond = sql`t.snoozed_until > now()`;
				break;
			case "all":
				conds.push(sql`not (m.roles ?| array['trash','spam'])`);
				break;
			case "label": {
				if (!q.labelId) throw new ApiError(400, "labelId is required for label view", "invalid_input");
				const [f] = await this.db
					.select()
					.from(mailboxFolders)
					.where(and(eq(mailboxFolders.id, q.labelId), eq(mailboxFolders.organizationId, scope.orgId)))
					.limit(1);
				if (!f) throw new ApiError(404, "Folder not found", "folder_not_found");
				await this.boxes.require(scope, f.mailboxId);
				conds.push(sql`m.mailbox_id = ${f.mailboxId} and m.labels ? ${f.providerId}`);
				break;
			}
			default:
				conds.push(sql`m.roles ? ${q.view}`);
		}
		if (q.view === "inbox" && q.category !== "all") {
			if (q.category === "primary") {
				conds.push(sql`not (coalesce(m.labels, '[]'::jsonb) ?| array[${sql.join(CATEGORY_LABELS.map((l) => sql`${l}`), sql`, `)}])`);
			} else {
				conds.push(sql`m.labels ? ${`CATEGORY_${q.category.toUpperCase()}`}`);
			}
		}
		if (q.unread) conds.push(sql`m.is_unread`);
		if (q.starred) conds.push(sql`m.is_starred`);
		if (q.attachments) conds.push(sql`m.has_attachments`);
		const msgCond = conds.length ? sql.join(conds, sql` and `) : sql`true`;
		const mbCond = q.mailboxId ? sql`and mb.id = ${q.mailboxId}` : sql``;

		const rows = await this.db.execute<{ id: string }>(sql`
			select t.id
			from threads t
			join mailboxes mb on mb.id = t.mailbox_id and mb.organization_id = ${scope.orgId} and mb.user_id = ${scope.userId} ${mbCond}
			join lateral (
				select m.internal_date from messages m
				where m.thread_id = t.id and ${msgCond}
				order by m.internal_date desc nulls last limit 1
			) lm on true
			where t.organization_id = ${scope.orgId} and ${threadCond}
			order by lm.internal_date desc nulls last
			limit ${q.limit + 1} offset ${q.offset}`);
		const ids = rows.map((r) => r.id);
		const hasMore = ids.length > q.limit;
		return { threads: await this.buildItems(scope, ids.slice(0, q.limit), q.view === "trash" || q.view === "spam"), hasMore };
	}

	/** Thread list items for given ids (keeps the order). */
	async buildItems(scope: MailScope, threadIds: string[], includeTrash = false): Promise<ThreadListItem[]> {
		if (!threadIds.length) return [];
		const cipher = orgCipher(scope.orgId);
		const ts = await this.db
			.select()
			.from(threads)
			.where(and(inArray(threads.id, threadIds), eq(threads.organizationId, scope.orgId)));
		const msgs: Row[] = await this.db
			.select({
				id: messages.id,
				threadId: messages.threadId,
				mailboxId: messages.mailboxId,
				envelopeEnc: messages.envelopeEnc,
				isUnread: messages.isUnread,
				isStarred: messages.isStarred,
				isDraft: messages.isDraft,
				hasAttachments: messages.hasAttachments,
				roles: messages.roles,
				labels: messages.labels,
				internalDate: messages.internalDate,
			})
			.from(messages)
			.where(and(inArray(messages.threadId, threadIds), eq(messages.organizationId, scope.orgId)))
			.orderBy(desc(messages.internalDate));
		const boxIds = [...new Set(ts.map((t) => t.mailboxId))];
		const boxes = boxIds.length
			? await this.db
					.select({ id: mailboxes.id, email: mailboxes.emailAddress, userId: mailboxes.userId })
					.from(mailboxes)
					.where(and(inArray(mailboxes.id, boxIds), eq(mailboxes.organizationId, scope.orgId)))
			: [];
		const boxMap = new Map(boxes.filter((b) => b.userId === scope.userId).map((b) => [b.id, b.email]));
		const folders = boxIds.length
			? await this.db
					.select({ id: mailboxFolders.id, mailboxId: mailboxFolders.mailboxId, providerId: mailboxFolders.providerId, role: mailboxFolders.role })
					.from(mailboxFolders)
					.where(and(inArray(mailboxFolders.mailboxId, boxIds), eq(mailboxFolders.role, "custom")))
			: [];
		const byThread = new Map<string, Row[]>();
		for (const m of msgs) {
			if (!m.threadId) continue;
			const list = byThread.get(m.threadId) ?? [];
			list.push(m);
			byThread.set(m.threadId, list);
		}
		const tMap = new Map(ts.map((t) => [t.id, t]));
		const out: ThreadListItem[] = [];
		for (const id of threadIds) {
			const t = tMap.get(id);
			const all = byThread.get(id);
			if (!t || !all?.length || !boxMap.has(t.mailboxId)) continue;
			const visible = includeTrash ? all : all.filter((m) => !(m.roles ?? []).some((r) => r === "trash" || r === "spam"));
			const list = visible.length ? visible : all;
			const latest = list[0];
			const env = cipher.dec<Envelope>(latest.envelopeEnc);
			const names: string[] = [];
			for (const m of list) {
				const e = m === latest ? env : cipher.dec<Envelope>(m.envelopeEnc);
				const n = displayName(e?.from);
				if (!names.includes(n)) names.push(n);
				if (names.length >= 3) break;
			}
			const roles = [...new Set(list.flatMap((m) => m.roles ?? []))] as FolderRole[];
			const labelSet = new Set(list.flatMap((m) => m.labels ?? []));
			out.push({
				id: t.id,
				mailboxId: t.mailboxId,
				mailboxEmail: boxMap.get(t.mailboxId) ?? "",
				subject: env?.subject ?? null,
				snippet: env?.snippet ?? null,
				lastMessageAt: latest.internalDate?.toISOString() ?? null,
				messageCount: list.length,
				from: env?.from ?? null,
				participants: names,
				unread: list.some((m) => m.isUnread),
				starred: list.some((m) => m.isStarred),
				hasAttachments: list.some((m) => m.hasAttachments),
				hasDraft: list.some((m) => m.isDraft),
				roles,
				labelIds: folders.filter((f) => f.mailboxId === t.mailboxId && labelSet.has(f.providerId)).map((f) => f.id),
				category: categoryOf(list.find((m) => (m.roles ?? []).includes("inbox"))?.labels ?? latest.labels),
				snoozedUntil: t.snoozedUntil && t.snoozedUntil > new Date() ? t.snoozedUntil.toISOString() : null,
			});
		}
		return out;
	}

	// ─── Detail ─────────────────────────────────────────────────────────────
	/** Thread + its mailbox, tenant-checked. */
	async requireThread(scope: MailScope, threadId: string) {
		const [row] = await this.db
			.select({ t: threads, mb: mailboxes })
			.from(threads)
			.innerJoin(mailboxes, eq(mailboxes.id, threads.mailboxId))
			.where(
				and(
					eq(threads.id, threadId),
					eq(threads.organizationId, scope.orgId),
					eq(mailboxes.organizationId, scope.orgId),
					eq(mailboxes.userId, scope.userId),
				),
			)
			.limit(1);
		if (!row) throw new ApiError(404, "Conversation not found", "thread_not_found");
		return row;
	}

	async requireMessage(scope: MailScope, messageId: string) {
		const [row] = await this.db
			.select({ m: messages, mb: mailboxes })
			.from(messages)
			.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
			.where(
				and(
					eq(messages.id, messageId),
					eq(messages.organizationId, scope.orgId),
					eq(mailboxes.organizationId, scope.orgId),
					eq(mailboxes.userId, scope.userId),
				),
			)
			.limit(1);
		if (!row) throw new ApiError(404, "Message not found", "message_not_found");
		return row;
	}

	async threadMessages(threadId: string, orgId: string): Promise<Message[]> {
		return this.db
			.select()
			.from(messages)
			.where(and(eq(messages.threadId, threadId), eq(messages.organizationId, orgId)))
			.orderBy(asc(messages.internalDate));
	}

	async getThread(scope: MailScope, threadId: string, opts: { images: boolean }): Promise<ThreadDetail> {
		const { t, mb } = await this.requireThread(scope, threadId);
		const all = await this.threadMessages(t.id, scope.orgId);
		const nonTrash = all.filter((m) => !(m.roles ?? []).some((r) => r === "trash" || r === "spam"));
		const list = nonTrash.length ? nonTrash : all;
		const bodies = await this.fetchBodies(mb, list);
		const cipher = orgCipher(scope.orgId);
		const views: MessageView[] = list.map((m) => {
			const env = cipher.dec<Envelope>(m.envelopeEnc);
			const body = bodies.get(m.id) ?? null;
			return this.toView(m, env, body, opts.images);
		});
		const roles = [...new Set(list.flatMap((m) => m.roles ?? []))] as FolderRole[];
		const labelSet = new Set(list.flatMap((m) => m.labels ?? []));
		const custom = await this.db
			.select({ id: mailboxFolders.id, providerId: mailboxFolders.providerId })
			.from(mailboxFolders)
			.where(and(eq(mailboxFolders.mailboxId, mb.id), eq(mailboxFolders.role, "custom")));
		const summary = cipher.dec<{ subject: string | null }>(t.summaryEnc);
		return {
			id: t.id,
			mailboxId: mb.id,
			mailboxEmail: mb.emailAddress,
			provider: mb.provider,
			subject: views[views.length - 1]?.subject ?? summary?.subject ?? null,
			starred: list.some((m) => m.isStarred),
			unread: list.some((m) => m.isUnread),
			roles,
			labelIds: custom.filter((f) => labelSet.has(f.providerId)).map((f) => f.id),
			snoozedUntil: t.snoozedUntil && t.snoozedUntil > new Date() ? t.snoozedUntil.toISOString() : null,
			messages: views,
		};
	}

	private toView(m: Message, env: Envelope | null, body: LiveBody | null, images: boolean): MessageView {
		const attachments: AttachmentView[] = (body?.attachments ?? []).map((a) => ({
			id: a.id,
			filename: a.filename,
			mimeType: a.mimeType,
			size: a.size,
			inline: a.inline,
			url: attachmentUrl(m.id, a.id),
		}));
		let html: string | null = null;
		let hasRemoteImages = false;
		if (body?.html) {
			const cidUrls: Record<string, string> = {};
			for (const a of body.attachments) if (a.contentId) cidUrls[a.contentId] = `${attachmentUrl(m.id, a.id)}&inline=1`;
			const s = sanitizeEmailHtml(body.html, { allowRemoteImages: images, cidUrls });
			html = s.html;
			hasRemoteImages = s.hasRemoteImages;
		}
		const none: Address[] = [];
		return {
			id: m.id,
			from: env?.from ?? null,
			to: env?.to ?? none,
			cc: env?.cc ?? none,
			bcc: env?.bcc ?? none,
			replyTo: env?.replyTo ?? null,
			subject: env?.subject ?? null,
			date: m.internalDate?.toISOString() ?? null,
			unread: m.isUnread,
			starred: m.isStarred,
			isDraft: m.isDraft,
			roles: (m.roles ?? []) as FolderRole[],
			html,
			text: body?.text ?? (body ? null : env?.snippet ?? null),
			hasRemoteImages,
			attachments: attachments.filter((a) => !a.inline || !html),
			unavailable: !body,
		};
	}

	// ─── Live bodies ────────────────────────────────────────────────────────
	/** Fetch bodies from the provider (or the 1-hour encrypted cache). */
	async fetchBodies(mb: Mailbox, list: Message[]): Promise<Map<string, LiveBody>> {
		const out = new Map<string, LiveBody>();
		const missing: Message[] = [];
		for (const m of list) {
			const hit = await this.cache.get<LiveBody>(mb.organizationId, mb.id, "b", m.id).catch(() => null);
			if (hit) out.set(m.id, hit);
			else missing.push(m);
		}
		if (!missing.length) return out;
		try {
			if (mb.provider === "gmail") {
				const token = await this.boxes.gmailToken(mb);
				await Promise.all(
					missing.map(async (m) => {
						try {
							const full = await gmail.getMessageFull(token, m.providerMessageId);
							out.set(m.id, parseGmailPayload(full.payload));
						} catch (err) {
							log.warn("body.fetch_failed", { messageId: m.id, err: err as Error });
						}
					}),
				);
			} else {
				const byFolder = new Map<string, Message[]>();
				for (const m of missing) {
					if (!m.folder || !m.uid) continue;
					byFolder.set(m.folder, [...(byFolder.get(m.folder) ?? []), m]);
				}
				await withImap(this.boxes.imapConfig(mb), async (c) => {
					for (const [folder, ms] of byFolder) {
						await withFolder(c, folder, async () => {
							for (const m of ms) {
								const src = await fetchSource(c, m.uid as number);
								if (!src) continue;
								const p = await parseSource(src);
								out.set(m.id, { html: p.html, text: p.text, attachments: p.attachments, references: p.references, messageId: p.messageId });
							}
						});
					}
				});
			}
		} catch (err) {
			log.warn("body.provider_unavailable", { mailboxId: mb.id, err: err as Error });
		}
		for (const m of missing) {
			const b = out.get(m.id);
			if (b) await this.cache.put(mb.organizationId, mb.id, "b", m.id, b).catch(() => undefined);
		}
		return out;
	}

	async fetchBody(mb: Mailbox, m: Message): Promise<LiveBody | null> {
		return (await this.fetchBodies(mb, [m])).get(m.id) ?? null;
	}

	/** Attachment bytes, straight from the provider. */
	async attachmentContent(messageId: string, attachmentId: string) {
		const [row] = await this.db
			.select({ m: messages, mb: mailboxes })
			.from(messages)
			.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
			.where(eq(messages.id, messageId))
			.limit(1);
		if (!row) throw new ApiError(404, "Attachment not found", "not_found");
		return this.attachmentFor(row.mb, row.m, attachmentId);
	}

	async attachmentFor(mb: Mailbox, m: Message, attachmentId: string): Promise<{ filename: string; mimeType: string; content: Buffer }> {
		if (mb.provider === "gmail") {
			const token = await this.boxes.gmailToken(mb);
			const full = await gmail.getMessageFull(token, m.providerMessageId);
			const body = parseGmailPayload(full.payload);
			const a = body.attachments.find((x) => x.id === attachmentId);
			if (!a) throw new ApiError(404, "Attachment not found", "not_found");
			let content: Buffer;
			if (a.providerRef?.startsWith("part:")) {
				const part = findGmailPart(full.payload, a.providerRef.slice(5));
				content = Buffer.from(part?.body?.data ?? "", "base64url");
			} else if (a.providerRef) {
				content = await gmail.getAttachment(token, m.providerMessageId, a.providerRef);
			} else throw new ApiError(404, "Attachment not found", "not_found");
			return { filename: a.filename, mimeType: a.mimeType, content };
		}
		if (!m.folder || !m.uid) throw new ApiError(404, "Attachment not found", "not_found");
		return withImap(this.boxes.imapConfig(mb), (c) =>
			withFolder(c, m.folder as string, async () => {
				const src = await fetchSource(c, m.uid as number);
				if (!src) throw new ApiError(404, "This message is no longer on the server", "not_found");
				const p = await parseSource(src);
				const i = p.attachments.findIndex((x) => x.id === attachmentId);
				if (i < 0) throw new ApiError(404, "Attachment not found", "not_found");
				return { filename: p.attachments[i].filename, mimeType: p.attachments[i].mimeType, content: p.contents[i] };
			}),
		);
	}
}
