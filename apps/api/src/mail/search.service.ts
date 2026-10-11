import { Inject, Injectable } from "@nestjs/common";
import type { ThreadListResponse } from "@postscript/types";
import { and, desc, eq, inArray } from "drizzle-orm";
import { log } from "../common/logger";
import { DB, type Db } from "../db/db";
import { type Mailbox, mailboxFolders, messages } from "../db/schema";
import * as gmail from "./gmail.client";
import { folderStatus, withFolder, withImap } from "./imap.client";
import { fromGmailMeta, IngestService } from "./ingest.service";
import { type MailScope, MailboxService } from "./mailbox.service";
import { ReadService } from "./read.service";
import { SyncService } from "./sync.service";

const PER_MAILBOX = 40;

export interface SearchInput {
	q: string;
	from?: string;
	mailboxId?: string;
	unread?: boolean;
	starred?: boolean;
	attachments?: boolean;
}

/** Gmail query for the same filters. Exported for tests. */
export function gmailQuery(i: SearchInput): string {
	const parts = [i.q];
	if (i.from) parts.push(`from:(${i.from.replace(/[()]/g, "")})`);
	if (i.unread) parts.push("is:unread");
	if (i.starred) parts.push("is:starred");
	if (i.attachments) parts.push("has:attachment");
	return parts.filter(Boolean).join(" ").trim();
}

/** IMAP SEARCH criteria for the same filters. Exported for tests. */
export function imapCriteria(i: SearchInput): Record<string, unknown> {
	const c: Record<string, unknown> = {};
	if (i.q) c.text = i.q;
	if (i.from) c.from = i.from;
	if (i.unread) c.seen = false;
	if (i.starred) c.flagged = true;
	if (!Object.keys(c).length) c.all = true;
	return c;
}

/**
 * Search runs on the provider (Gmail q=, IMAP SEARCH). We never index mail
 * content ourselves. Hits we have not synced yet get their metadata ingested.
 */
@Injectable()
export class SearchService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly boxes: MailboxService,
		private readonly ingest: IngestService,
		private readonly read: ReadService,
		private readonly sync: SyncService,
	) {}

	async search(scope: MailScope, input: SearchInput): Promise<ThreadListResponse> {
		const list = input.mailboxId ? [await this.boxes.require(scope, input.mailboxId)] : await this.boxes.list(scope);
		const messageIds: string[] = [];
		await Promise.all(
			list.map(async (mb) => {
				try {
					const ids = mb.provider === "gmail" ? await this.searchGmail(mb, input) : await this.searchImap(mb, input);
					messageIds.push(...ids);
				} catch (err) {
					log.warn("search.provider_failed", { mailboxId: mb.id, err: err as Error });
				}
			}),
		);
		if (!messageIds.length) return { threads: [], hasMore: false };
		const rows = await this.db
			.select({ threadId: messages.threadId, date: messages.internalDate, attach: messages.hasAttachments })
			.from(messages)
			.where(and(inArray(messages.id, messageIds), eq(messages.organizationId, scope.orgId)))
			.orderBy(desc(messages.internalDate));
		const threadIds: string[] = [];
		for (const r of rows) {
			if (!r.threadId || threadIds.includes(r.threadId)) continue;
			if (input.attachments && !r.attach) continue;
			threadIds.push(r.threadId);
		}
		return { threads: await this.read.buildItems(scope, threadIds.slice(0, 100), true), hasMore: false };
	}

	private async searchGmail(mb: Mailbox, input: SearchInput): Promise<string[]> {
		const token = await this.boxes.gmailToken(mb);
		const page = await gmail.listMessageIds(token, { q: gmailQuery(input), max: PER_MAILBOX });
		const out: string[] = [];
		for (const m of page.messages) {
			const [have] = await this.db
				.select({ id: messages.id })
				.from(messages)
				.where(and(eq(messages.mailboxId, mb.id), eq(messages.providerMessageId, m.id)))
				.limit(1);
			if (have) out.push(have.id);
			else {
				const meta = await gmail.getMessageMeta(token, m.id);
				out.push((await this.ingest.upsert(mb, fromGmailMeta(meta))).messageId);
			}
		}
		return out;
	}

	private async searchImap(mb: Mailbox, input: SearchInput): Promise<string[]> {
		const folders = await this.db
			.select()
			.from(mailboxFolders)
			.where(and(eq(mailboxFolders.mailboxId, mb.id), inArray(mailboxFolders.role, ["inbox", "sent", "archive", "custom"])));
		const out: string[] = [];
		await withImap(this.boxes.imapConfig(mb), async (c) => {
			for (const f of folders) {
				const uids = await withFolder(c, f.providerId, async () => {
					const r = await c.search(imapCriteria(input), { uid: true });
					return (Array.isArray(r) ? r : []).sort((a, b) => b - a).slice(0, PER_MAILBOX);
				});
				if (!uids.length) continue;
				const st = await folderStatus(c, f.providerId);
				const known = await this.db
					.select({ id: messages.id, uid: messages.uid })
					.from(messages)
					.where(and(eq(messages.mailboxId, mb.id), eq(messages.folder, f.providerId), inArray(messages.uid, uids)));
				out.push(...known.map((k) => k.id));
				const missing = uids.filter((u) => !known.some((k) => k.uid === u));
				if (missing.length && st.uidValidity === f.uidValidity) {
					out.push(...(await this.sync.imapIngestUids(mb, c, f.providerId, missing)));
				}
			}
		});
		return out;
	}
}
