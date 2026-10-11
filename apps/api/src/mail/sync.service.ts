import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import type { ImapFlow } from "imapflow";
import { env } from "../config/env";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { DB, type Db } from "../db/db";
import { type Mailbox, type MailboxFolder, mailboxes, mailboxFolders, messages } from "../db/schema";
import * as gmail from "./gmail.client";
import { GmailHttpError } from "./gmail.client";
import { ensureFolder, fetchFlags, fetchMeta, folderStatus, listFolders, withFolder, withImap } from "./imap.client";
import { fromGmailMeta, fromImapMeta, IngestService } from "./ingest.service";
import { MailboxService } from "./mailbox.service";

const GMAIL_BATCH = 40;
const IMAP_BATCH = 50;
const FLAG_WINDOW = 300;

export interface StepResult {
	hasMore: boolean;
	added: number;
}

/** Roles the IMAP sync makes sure exist on the server. */
const REQUIRED_IMAP_ROLES: Array<{ role: string; path: string; name: string }> = [
	{ role: "sent", path: "Sent", name: "Sent" },
	{ role: "drafts", path: "Drafts", name: "Drafts" },
	{ role: "archive", path: "Archive", name: "Archive" },
	{ role: "spam", path: "Junk", name: "Spam" },
	{ role: "trash", path: "Trash", name: "Trash" },
];

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
	const queue = [...items];
	await Promise.all(
		Array.from({ length: Math.min(size, queue.length) }, async () => {
			while (queue.length) await fn(queue.shift() as T);
		}),
	);
}

/**
 * Keeps local metadata in step with the provider, both ways:
 *  - backfill: newest first, in small batches (one batch per queue job)
 *  - incremental: new mail, flag/label changes, deletions and moves
 * Only metadata is written; bodies stay on the provider.
 */
@Injectable()
export class SyncService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly mailboxesSvc: MailboxService,
		private readonly ingest: IngestService,
	) {}

	private backfillLimit() {
		return Number(process.env.SYNC_BACKFILL_LIMIT ?? 1000);
	}

	async backfillStep(mailboxId: string): Promise<StepResult & { syncedCount: number }> {
		const m = await this.mailboxesSvc.byId(mailboxId);
		if (!m) return { hasMore: false, added: 0, syncedCount: 0 };
		try {
			await this.db.update(mailboxes).set({ status: "syncing", error: null }).where(eq(mailboxes.id, m.id));
			const r = m.provider === "gmail" ? await this.gmailBackfill(m) : await this.imapBackfill(m);
			const syncedCount = m.syncedCount + r.added;
			await this.db
				.update(mailboxes)
				.set({ status: r.hasMore ? "syncing" : "ready", syncedCount, lastSyncedAt: new Date() })
				.where(eq(mailboxes.id, m.id));
			return { ...r, syncedCount };
		} catch (err) {
			await this.markError(m, err);
			throw err;
		}
	}

	async incremental(mailboxId: string): Promise<StepResult> {
		const m = await this.mailboxesSvc.byId(mailboxId);
		if (!m || m.status === "pending") return { hasMore: false, added: 0 };
		try {
			const r = m.provider === "gmail" ? await this.gmailIncremental(m) : await this.imapIncremental(m);
			await this.db
				.update(mailboxes)
				.set({
					syncedCount: m.syncedCount + r.added,
					lastSyncedAt: new Date(),
					...(m.status === "error" ? { status: "ready" as const, error: null } : {}),
				})
				.where(eq(mailboxes.id, m.id));
			return r;
		} catch (err) {
			await this.markError(m, err);
			throw err;
		}
	}

	private async markError(m: Mailbox, err: unknown) {
		const msg =
			err instanceof ApiError
				? err.message
				: err instanceof GmailHttpError && err.status === 401
					? "Gmail access was revoked. Please reconnect."
					: "Sync failed. We will retry shortly.";
		log.warn("sync.failed", { mailboxId: m.id, err: err as Error });
		await this.db.update(mailboxes).set({ status: "error", error: msg }).where(eq(mailboxes.id, m.id));
	}

	// ─── Gmail ────────────────────────────────────────────────────────────────
	async syncGmailLabels(m: Mailbox, token: string) {
		const labels = await gmail.listLabels(token);
		const rows = [
			...gmail.GMAIL_SYSTEM_FOLDERS.map((f) => ({ providerId: f.id, name: f.name, role: f.role })),
			...labels.filter((l) => l.type === "user").map((l) => ({ providerId: l.id, name: l.name, role: "custom" })),
		];
		for (const r of rows) {
			await this.db
				.insert(mailboxFolders)
				.values({ organizationId: m.organizationId, mailboxId: m.id, ...r })
				.onConflictDoUpdate({ target: [mailboxFolders.mailboxId, mailboxFolders.providerId], set: { name: r.name } });
		}
		const keep = new Set(rows.map((r) => r.providerId));
		const existing = await this.db.select().from(mailboxFolders).where(eq(mailboxFolders.mailboxId, m.id));
		const gone = existing.filter((f) => !keep.has(f.providerId)).map((f) => f.id);
		if (gone.length) await this.db.delete(mailboxFolders).where(inArray(mailboxFolders.id, gone));
	}

	private async gmailIngestIds(m: Mailbox, token: string, ids: string[]): Promise<number> {
		let added = 0;
		await pool(ids, 5, async (id) => {
			try {
				const meta = await gmail.getMessageMeta(token, id);
				const r = await this.ingest.upsert(m, fromGmailMeta(meta));
				if (r.inserted) added++;
			} catch (err) {
				if (err instanceof GmailHttpError && err.status === 404) return; // deleted meanwhile
				throw err;
			}
		});
		return added;
	}

	async gmailIngestOne(m: Mailbox, id: string): Promise<void> {
		const token = await this.mailboxesSvc.gmailToken(m);
		await this.gmailIngestIds(m, token, [id]);
	}

	private async gmailBackfill(m: Mailbox): Promise<StepResult> {
		const token = await this.mailboxesSvc.gmailToken(m);
		const first = !m.backfillPageToken && m.syncedCount === 0;
		if (first || !m.historyId) {
			await this.syncGmailLabels(m, token);
			const profile = await gmail.getProfile(token);
			// Take the history cursor BEFORE listing so nothing slips between.
			await this.db.update(mailboxes).set({ historyId: profile.historyId ?? null }).where(eq(mailboxes.id, m.id));
		}
		const page = await gmail.listMessageIds(token, {
			pageToken: m.backfillPageToken ?? undefined,
			max: GMAIL_BATCH,
			includeSpamTrash: true,
		});
		const added = await this.gmailIngestIds(m, token, page.messages.map((x) => x.id));
		const reachedCap = m.syncedCount + added >= this.backfillLimit();
		const hasMore = Boolean(page.nextPageToken) && !reachedCap;
		await this.db
			.update(mailboxes)
			.set({ backfillPageToken: hasMore ? (page.nextPageToken ?? null) : null })
			.where(eq(mailboxes.id, m.id));
		return { hasMore, added };
	}

	private async gmailIncremental(m: Mailbox): Promise<StepResult> {
		const token = await this.mailboxesSvc.gmailToken(m);
		if (!m.historyId) return { hasMore: false, added: 0 };
		let pageToken: string | undefined;
		let latest = m.historyId;
		const added = new Set<string>();
		const deleted = new Set<string>();
		const changed = new Set<string>();
		try {
			do {
				const h = await gmail.listHistory(token, m.historyId, pageToken);
				for (const rec of h.history ?? []) {
					for (const a of rec.messagesAdded ?? []) added.add(a.message.id);
					for (const d of rec.messagesDeleted ?? []) deleted.add(d.message.id);
					for (const l of [...(rec.labelsAdded ?? []), ...(rec.labelsRemoved ?? [])]) changed.add(l.message.id);
				}
				if (h.historyId) latest = h.historyId;
				pageToken = h.nextPageToken;
			} while (pageToken);
		} catch (err) {
			if (err instanceof GmailHttpError && err.status === 404) {
				// History expired (mailbox idle for a long time): restart from now
				// and pull the most recent page so nothing new is missed.
				const profile = await gmail.getProfile(token);
				const page = await gmail.listMessageIds(token, { max: GMAIL_BATCH, includeSpamTrash: true });
				const n = await this.gmailIngestIds(m, token, page.messages.map((x) => x.id));
				await this.db.update(mailboxes).set({ historyId: profile.historyId ?? null }).where(eq(mailboxes.id, m.id));
				return { hasMore: false, added: n };
			}
			throw err;
		}
		for (const id of deleted) {
			added.delete(id);
			changed.delete(id);
		}
		await this.ingest.deleteByProviderIds(m.id, [...deleted]);
		// Label changes and new mail: re-read metadata (labels + flags) for each.
		const n = await this.gmailIngestIds(m, token, [...new Set([...added, ...changed])]);
		await this.db.update(mailboxes).set({ historyId: latest }).where(eq(mailboxes.id, m.id));
		if (changed.size || added.size) await this.syncGmailLabels(m, token).catch(() => undefined);
		return { hasMore: false, added: n };
	}

	// ─── IMAP ─────────────────────────────────────────────────────────────────
	/** Refresh the folder list (and create missing system folders). */
	async syncImapFolders(m: Mailbox, c: ImapFlow): Promise<MailboxFolder[]> {
		let found = await listFolders(c);
		let created = false;
		for (const req of REQUIRED_IMAP_ROLES) {
			if (!found.some((f) => f.role === req.role)) {
				await ensureFolder(c, req.path);
				created = true;
			}
		}
		if (created) found = await listFolders(c);
		for (const req of REQUIRED_IMAP_ROLES) {
			const f = found.find((x) => x.path === req.path && x.role === "custom");
			if (f && !found.some((x) => x.role === req.role)) f.role = req.role;
		}
		for (const f of found) {
			await this.db
				.insert(mailboxFolders)
				.values({ organizationId: m.organizationId, mailboxId: m.id, providerId: f.path, name: f.name, role: f.role })
				.onConflictDoUpdate({
					target: [mailboxFolders.mailboxId, mailboxFolders.providerId],
					set: { name: f.name, role: f.role },
				});
		}
		const keep = new Set(found.map((f) => f.path));
		const rows = await this.db.select().from(mailboxFolders).where(eq(mailboxFolders.mailboxId, m.id));
		const gone = rows.filter((r) => !keep.has(r.providerId));
		if (gone.length) {
			await this.db.delete(mailboxFolders).where(inArray(mailboxFolders.id, gone.map((g) => g.id)));
			for (const g of gone) {
				await this.db.delete(messages).where(and(eq(messages.mailboxId, m.id), eq(messages.folder, g.providerId)));
			}
			await this.ingest.pruneEmptyThreads(m.id);
		}
		return rows.filter((r) => keep.has(r.providerId));
	}

	/** Make sure the folder's UIDVALIDITY matches; reset its local copy if not. */
	private async checkValidity(m: Mailbox, c: ImapFlow, f: MailboxFolder): Promise<MailboxFolder> {
		const st = await folderStatus(c, f.providerId);
		if (f.uidValidity === st.uidValidity) return f;
		await this.db.delete(messages).where(and(eq(messages.mailboxId, m.id), eq(messages.folder, f.providerId)));
		await this.ingest.pruneEmptyThreads(m.id);
		const high = Math.max(0, st.uidNext - 1);
		const [row] = await this.db
			.update(mailboxFolders)
			.set({ uidValidity: st.uidValidity, lastUid: high, backfillCursor: high, backfillDone: high < 1 })
			.where(eq(mailboxFolders.id, f.id))
			.returning();
		return row;
	}

	private folderPriority(f: MailboxFolder) {
		return ["inbox", "sent", "drafts", "archive", "custom", "spam", "trash"].indexOf(f.role);
	}

	private async imapBackfill(m: Mailbox): Promise<StepResult> {
		const cfg = this.mailboxesSvc.imapConfig(m);
		return withImap(cfg, async (c) => {
			let folders = await this.syncImapFolders(m, c);
			folders = folders.sort((a, b) => this.folderPriority(a) - this.folderPriority(b));
			let target = folders.find((f) => !f.backfillDone);
			if (!target) return { hasMore: false, added: 0 };
			target = await this.checkValidity(m, c, target);
			if (target.backfillDone) return { hasMore: folders.some((f) => f.id !== target?.id && !f.backfillDone), added: 0 };

			const cap = target.role === "inbox" ? this.backfillLimit() : Math.min(300, this.backfillLimit());
			const high = target.backfillCursor ?? 0;
			const low = Math.max(1, high - IMAP_BATCH + 1);
			let added = 0;
			if (high >= 1) {
				added = await withFolder(c, target.providerId, async () => {
					const items = await fetchMeta(c, `${low}:${high}`);
					let n = 0;
					for (const it of items) {
						const meta = await fromImapMeta(it, { path: target!.providerId, role: target!.role }, target!.uidValidity ?? "0");
						if ((await this.ingest.upsert(m, meta)).inserted) n++;
					}
					return n;
				});
			}
			const fetchedSoFar = (target.lastUid ?? 0) - (low - 1);
			const done = low <= 1 || fetchedSoFar >= cap;
			await this.db
				.update(mailboxFolders)
				.set({ backfillCursor: done ? null : low - 1, backfillDone: done })
				.where(eq(mailboxFolders.id, target.id));
			const hasMore = !done || folders.some((f) => f.id !== target!.id && !f.backfillDone);
			return { hasMore, added };
		});
	}

	private async imapIncremental(m: Mailbox): Promise<StepResult> {
		const cfg = this.mailboxesSvc.imapConfig(m);
		return withImap(cfg, async (c) => {
			const folders = await this.syncImapFolders(m, c);
			let added = 0;
			for (let f of folders) {
				if (f.uidValidity == null) continue; // not backfilled yet
				const before = f.uidValidity;
				f = await this.checkValidity(m, c, f);
				if (f.uidValidity !== before) continue;
				added += await withFolder(c, f.providerId, async () => {
					const last = f.lastUid ?? 0;
					let n = 0;
					// 1. New mail.
					const fresh = (await fetchMeta(c, `${last + 1}:*`)).filter((x) => x.uid > last);
					let maxUid = last;
					for (const it of fresh) {
						const meta = await fromImapMeta(it, { path: f.providerId, role: f.role }, f.uidValidity ?? "0");
						if ((await this.ingest.upsert(m, meta)).inserted) n++;
						maxUid = Math.max(maxUid, it.uid);
					}
					if (maxUid > last) {
						await this.db.update(mailboxFolders).set({ lastUid: maxUid }).where(eq(mailboxFolders.id, f.id));
					}
					// 2. Flag changes and deletions in the recent window.
					if (maxUid >= 1) {
						const from = Math.max(1, maxUid - FLAG_WINDOW);
						const flags = await fetchFlags(c, `${from}:${maxUid}`);
						const local = await this.db
							.select({ id: messages.id, uid: messages.uid, isUnread: messages.isUnread, isStarred: messages.isStarred })
							.from(messages)
							.where(
								and(
									eq(messages.mailboxId, m.id),
									eq(messages.folder, f.providerId),
									isNotNull(messages.uid),
									gte(messages.uid, from),
									lte(messages.uid, maxUid),
								),
							);
						const vanished: string[] = [];
						for (const row of local) {
							const fl = flags.get(row.uid as number);
							if (!fl) {
								vanished.push(row.id);
								continue;
							}
							const unread = !fl.has("\\Seen");
							const starred = fl.has("\\Flagged");
							if (unread !== row.isUnread || starred !== row.isStarred) {
								await this.db.update(messages).set({ isUnread: unread, isStarred: starred }).where(eq(messages.id, row.id));
							}
						}
						if (vanished.length) {
							await this.db.delete(messages).where(inArray(messages.id, vanished));
							await this.ingest.pruneEmptyThreads(m.id);
						}
					}
					return n;
				});
			}
			return { hasMore: false, added };
		});
	}

	/** Ingest specific UIDs of one folder (after APPEND / MOVE / search). */
	async imapIngestUids(m: Mailbox, c: ImapFlow, folderPath: string, uids: number[]): Promise<string[]> {
		if (!uids.length) return [];
		const [f] = await this.db
			.select()
			.from(mailboxFolders)
			.where(and(eq(mailboxFolders.mailboxId, m.id), eq(mailboxFolders.providerId, folderPath)))
			.limit(1);
		const st = await folderStatus(c, folderPath);
		return withFolder(c, folderPath, async () => {
			const items = await fetchMeta(c, uids.join(","));
			const ids: string[] = [];
			for (const it of items) {
				const meta = await fromImapMeta(it, { path: folderPath, role: f?.role ?? "custom" }, st.uidValidity);
				ids.push((await this.ingest.upsert(m, meta)).messageId);
			}
			return ids;
		});
	}

	syncIntervalMinutes() {
		return env().SYNC_INTERVAL_MINUTES;
	}
}
