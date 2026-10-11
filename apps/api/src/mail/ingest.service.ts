import { Inject, Injectable } from "@nestjs/common";
import type { Address } from "@postscript/types";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { simpleParser } from "mailparser";
import { orgCipher } from "../common/crypto";
import { DB, type Db } from "../db/db";
import { type Mailbox, messages, threads } from "../db/schema";
import { gmailRoles, header, type GmailMessage } from "./gmail.client";
import type { ImapMetaItem } from "./imap.client";
import {
	cleanMessageId,
	isReplySubject,
	makeSnippet,
	normalizeSubject,
	parseAddressList,
	parseReferences,
	threadCandidates,
} from "./mime";

/** What we keep about a message: encrypted, never the body. */
export interface Envelope {
	from: Address | null;
	to: Address[];
	cc: Address[];
	bcc: Address[];
	replyTo: Address | null;
	subject: string | null;
	snippet: string | null;
	messageId: string | null;
}

export interface NormalizedMeta {
	providerMessageId: string;
	/** Gmail thread id; null means "thread it ourselves" (IMAP). */
	providerThreadId: string | null;
	folder: string | null;
	uid: number | null;
	envelope: Envelope;
	inReplyTo: string | null;
	references: string[];
	labels: string[];
	roles: string[];
	isUnread: boolean;
	isStarred: boolean;
	isDraft: boolean;
	hasAttachments: boolean;
	internalDate: Date | null;
	size: number | null;
}

export function fromGmailMeta(m: GmailMessage): NormalizedMeta {
	const p = m.payload;
	const labels = m.labelIds ?? [];
	const from = parseAddressList(header(p, "From"))[0] ?? null;
	const mime = (p?.mimeType ?? "").toLowerCase();
	return {
		providerMessageId: m.id,
		providerThreadId: m.threadId,
		folder: null,
		uid: null,
		envelope: {
			from,
			to: parseAddressList(header(p, "To")),
			cc: parseAddressList(header(p, "Cc")),
			bcc: parseAddressList(header(p, "Bcc")),
			replyTo: parseAddressList(header(p, "Reply-To"))[0] ?? null,
			subject: header(p, "Subject") ?? null,
			snippet: decodeEntities(m.snippet ?? "") || null,
			messageId: cleanMessageId(header(p, "Message-ID")),
		},
		inReplyTo: cleanMessageId(header(p, "In-Reply-To")),
		references: parseReferences(header(p, "References")),
		labels,
		roles: gmailRoles(labels),
		isUnread: labels.includes("UNREAD"),
		isStarred: labels.includes("STARRED"),
		isDraft: labels.includes("DRAFT"),
		hasAttachments: mime === "multipart/mixed",
		internalDate: m.internalDate ? new Date(Number(m.internalDate)) : null,
		size: m.sizeEstimate ?? null,
	};
}

function decodeEntities(s: string): string {
	return s
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function addr(list: Array<{ name?: string; address?: string }> | undefined): Address[] {
	return (list ?? [])
		.filter((a) => a.address)
		.map((a) => ({ name: a.name || null, address: String(a.address).toLowerCase() }));
}

export async function fromImapMeta(
	item: ImapMetaItem,
	folder: { path: string; role: string },
	uidValidity: string,
): Promise<NormalizedMeta> {
	const env = item.envelope;
	let references: string[] = [];
	let snippet: string | null = null;
	if (item.head) {
		try {
			const parsed = await simpleParser(item.head, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
			references = parseReferences(parsed.references as string | string[] | undefined);
			snippet = makeSnippet(parsed.text, typeof parsed.html === "string" ? parsed.html : null) || null;
		} catch {
			// truncated or odd source: envelope still gives us the basics
		}
	}
	const flags = item.flags;
	return {
		providerMessageId: `${folder.path}|${uidValidity}|${item.uid}`,
		providerThreadId: null,
		folder: folder.path,
		uid: item.uid,
		envelope: {
			from: addr(env?.from)[0] ?? null,
			to: addr(env?.to),
			cc: addr(env?.cc),
			bcc: addr(env?.bcc),
			replyTo: addr(env?.replyTo)[0] ?? null,
			subject: env?.subject ?? null,
			snippet,
			messageId: cleanMessageId(env?.messageId),
		},
		inReplyTo: cleanMessageId(env?.inReplyTo),
		references,
		labels: [folder.path],
		roles: [folder.role],
		isUnread: !flags.has("\\Seen"),
		isStarred: flags.has("\\Flagged"),
		isDraft: flags.has("\\Draft") || folder.role === "drafts",
		hasAttachments: item.hasAttachments,
		internalDate: item.internalDate ?? (env?.date ? new Date(env.date) : null),
		size: item.size || null,
	};
}

/**
 * Writes message metadata. Subject, addresses and snippet go in one
 * encrypted envelope; Message-IDs are stored only as keyed hashes. Idempotent:
 * re-ingesting a known message just refreshes its flags and labels.
 */
@Injectable()
export class IngestService {
	constructor(@Inject(DB) private readonly db: Db) {}

	async upsert(mailbox: Mailbox, meta: NormalizedMeta): Promise<{ messageId: string; inserted: boolean }> {
		const [existing] = await this.db
			.select({ id: messages.id })
			.from(messages)
			.where(and(eq(messages.mailboxId, mailbox.id), eq(messages.providerMessageId, meta.providerMessageId)))
			.limit(1);
		if (existing) {
			await this.db
				.update(messages)
				.set({
					labels: meta.labels,
					roles: meta.roles,
					isUnread: meta.isUnread,
					isStarred: meta.isStarred,
					isDraft: meta.isDraft,
					folder: meta.folder,
					uid: meta.uid,
				})
				.where(eq(messages.id, existing.id));
			return { messageId: existing.id, inserted: false };
		}

		const cipher = orgCipher(mailbox.organizationId);
		const threadId = await this.resolveThread(mailbox, meta, cipher);
		const refHashes = [...new Set([...meta.references, ...(meta.inReplyTo ? [meta.inReplyTo] : [])])].map(cipher.hash);

		const [row] = await this.db
			.insert(messages)
			.values({
				organizationId: mailbox.organizationId,
				mailboxId: mailbox.id,
				threadId,
				providerMessageId: meta.providerMessageId,
				folder: meta.folder,
				uid: meta.uid,
				msgIdHash: meta.envelope.messageId ? cipher.hash(meta.envelope.messageId) : null,
				refHashes,
				envelopeEnc: cipher.enc(meta.envelope),
				sizeBytes: meta.size,
				labels: meta.labels,
				roles: meta.roles,
				isUnread: meta.isUnread,
				isStarred: meta.isStarred,
				isDraft: meta.isDraft,
				hasAttachments: meta.hasAttachments,
				internalDate: meta.internalDate,
			})
			.onConflictDoNothing({ target: [messages.mailboxId, messages.providerMessageId] })
			.returning({ id: messages.id });
		if (!row) {
			const [again] = await this.db
				.select({ id: messages.id })
				.from(messages)
				.where(and(eq(messages.mailboxId, mailbox.id), eq(messages.providerMessageId, meta.providerMessageId)))
				.limit(1);
			return { messageId: again.id, inserted: false };
		}

		// Thread bookkeeping: count, newest date, encrypted subject/snippet.
		const [t] = await this.db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		const newer = !t.lastMessageAt || (meta.internalDate && meta.internalDate >= t.lastMessageAt);
		await this.db
			.update(threads)
			.set({
				messageCount: sql`${threads.messageCount} + 1`,
				...(newer
					? {
							lastMessageAt: meta.internalDate ?? new Date(),
							summaryEnc: cipher.enc({ subject: meta.envelope.subject, snippet: meta.envelope.snippet }),
						}
					: {}),
			})
			.where(eq(threads.id, threadId));
		return { messageId: row.id, inserted: true };
	}

	private async resolveThread(
		mailbox: Mailbox,
		meta: NormalizedMeta,
		cipher: ReturnType<typeof orgCipher>,
	): Promise<string> {
		const subjectNorm = normalizeSubject(meta.envelope.subject);
		const subjectHash = subjectNorm ? cipher.hash(subjectNorm) : null;
		let providerThreadId = meta.providerThreadId;

		if (!providerThreadId) {
			const { lookups, fallbackKey } = threadCandidates({
				messageId: meta.envelope.messageId,
				inReplyTo: meta.inReplyTo,
				references: meta.references,
			});
			// 1. A message we already have that this one references.
			if (lookups.length) {
				const hashes = lookups.map(cipher.hash);
				const [hit] = await this.db
					.select({ threadId: messages.threadId })
					.from(messages)
					.where(and(eq(messages.mailboxId, mailbox.id), inArray(messages.msgIdHash, hashes)))
					.limit(1);
				if (hit?.threadId) return hit.threadId;
			}
			// 2. A message we already have that references THIS one (arrived out of order).
			if (meta.envelope.messageId) {
				const own = cipher.hash(meta.envelope.messageId);
				const [child] = await this.db
					.select({ threadId: messages.threadId })
					.from(messages)
					.where(and(eq(messages.mailboxId, mailbox.id), sql`${messages.refHashes} @> ${JSON.stringify([own])}::jsonb`))
					.limit(1);
				if (child?.threadId) return child.threadId;
			}
			// 3. "Re: subject" with no headers: newest thread with the same subject in 30 days.
			if (subjectHash && isReplySubject(meta.envelope.subject)) {
				const since = new Date(Date.now() - 30 * 86400_000);
				const [same] = await this.db
					.select({ id: threads.id })
					.from(threads)
					.where(and(eq(threads.mailboxId, mailbox.id), eq(threads.subjectHash, subjectHash), gte(threads.lastMessageAt, since)))
					.orderBy(desc(threads.lastMessageAt))
					.limit(1);
				if (same) return same.id;
			}
			providerThreadId = `x-${cipher.hash(fallbackKey ?? meta.providerMessageId)}`;
		}

		const [t] = await this.db
			.insert(threads)
			.values({
				organizationId: mailbox.organizationId,
				mailboxId: mailbox.id,
				providerThreadId,
				subjectHash,
				lastMessageAt: meta.internalDate,
				messageCount: 0,
			})
			.onConflictDoUpdate({
				target: [threads.mailboxId, threads.providerThreadId],
				set: { updatedAt: new Date() },
			})
			.returning({ id: threads.id });
		return t.id;
	}

	async deleteByProviderIds(mailboxId: string, providerMessageIds: string[]) {
		if (!providerMessageIds.length) return;
		await this.db
			.delete(messages)
			.where(and(eq(messages.mailboxId, mailboxId), inArray(messages.providerMessageId, providerMessageIds)));
		await this.pruneEmptyThreads(mailboxId);
	}

	async pruneEmptyThreads(mailboxId: string) {
		await this.db.execute(
			sql`delete from threads t where t.mailbox_id = ${mailboxId} and not exists (select 1 from messages m where m.thread_id = t.id)`,
		);
	}
}
