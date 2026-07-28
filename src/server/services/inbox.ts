import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, messages, threads } from "@/db/schema";
import { ApiError } from "@/server/lib/http";
import { ensureThreadHtml } from "./mailbox";

export type Category =
	| "all"
	| "primary"
	| "promotions"
	| "social"
	| "updates";

const CATEGORY_LABEL: Record<Exclude<Category, "all" | "primary">, string> = {
	promotions: "CATEGORY_PROMOTIONS",
	social: "CATEGORY_SOCIAL",
	updates: "CATEGORY_UPDATES",
};

const NON_PRIMARY = [
	"CATEGORY_PROMOTIONS",
	"CATEGORY_SOCIAL",
	"CATEGORY_UPDATES",
	"CATEGORY_FORUMS",
];

export interface ThreadListItem {
	id: string;
	subject: string | null;
	snippet: string | null;
	lastMessageAt: string | null;
	messageCount: number;
	fromName: string | null;
	fromAddress: string | null;
	unread: boolean;
	category: Category;
}

function categoryOf(labels: string[] | null): Category {
	if (!labels) return "primary";
	if (labels.includes("CATEGORY_PROMOTIONS")) return "promotions";
	if (labels.includes("CATEGORY_SOCIAL")) return "social";
	if (labels.includes("CATEGORY_UPDATES")) return "updates";
	return "primary";
}

/** Latest message per thread, scoped to the user's mailboxes, filtered/paged. */
export async function listThreads(
	userId: string,
	opts: {
		category?: Category;
		mailboxId?: string | null;
		limit?: number;
		offset?: number;
	} = {},
): Promise<ThreadListItem[]> {
	const limit = Math.min(opts.limit ?? 40, 100);
	const offset = opts.offset ?? 0;
	const category = opts.category ?? "all";
	const mailboxFilter = opts.mailboxId
		? sql` and mb.id = ${opts.mailboxId}`
		: sql``;

	let labelFilter = sql``;
	if (category === "promotions" || category === "social" || category === "updates") {
		labelFilter = sql` and m.labels @> ${JSON.stringify([CATEGORY_LABEL[category]])}::jsonb`;
	} else if (category === "primary") {
		// Primary = none of the non-primary Gmail categories present.
		const clauses = NON_PRIMARY.map(
			(l) => sql`m.labels @> ${JSON.stringify([l])}::jsonb`,
		);
		labelFilter = sql` and not (${sql.join(clauses, sql` or `)})`;
	}

	const rows = await db.execute(sql`
		select t.id, t.subject, t.snippet, t.last_message_at, t.message_count,
		       m.from_name, m.from_address, m.is_unread, m.labels
		from ${threads} t
		join ${mailboxes} mb on mb.id = t.mailbox_id and mb.user_id = ${userId}${mailboxFilter}
		join lateral (
			select from_name, from_address, is_unread, labels
			from ${messages} m2
			where m2.thread_id = t.id
			order by m2.internal_date desc nulls last
			limit 1
		) m on true
		where true${labelFilter}
		order by t.last_message_at desc nulls last
		limit ${limit} offset ${offset}
	`);

	return (rows.rows as Record<string, unknown>[]).map((r) => ({
		id: r.id as string,
		subject: (r.subject as string) ?? null,
		snippet: (r.snippet as string) ?? null,
		lastMessageAt: r.last_message_at
			? new Date(r.last_message_at as string).toISOString()
			: null,
		messageCount: Number(r.message_count ?? 1),
		fromName: (r.from_name as string) ?? null,
		fromAddress: (r.from_address as string) ?? null,
		unread: Boolean(r.is_unread),
		category: categoryOf(r.labels as string[] | null),
	}));
}

export interface ThreadMessage {
	id: string;
	fromName: string | null;
	fromAddress: string | null;
	toAddresses: string[] | null;
	subject: string | null;
	bodyText: string | null;
	bodyHtml: string | null;
	snippet: string | null;
	internalDate: string | null;
	unread: boolean;
}

/** Full thread (ownership-checked) with its messages oldest→newest. */
export async function getThread(
	userId: string,
	threadId: string,
): Promise<{ id: string; subject: string | null; messages: ThreadMessage[] }> {
	const [thread] = await db
		.select({ id: threads.id, subject: threads.subject, mailboxId: threads.mailboxId })
		.from(threads)
		.where(eq(threads.id, threadId))
		.limit(1);
	if (!thread) throw new ApiError(404, "Thread not found", "thread_not_found");

	const [owner] = await db
		.select({ id: mailboxes.id })
		.from(mailboxes)
		.where(and(eq(mailboxes.id, thread.mailboxId), eq(mailboxes.userId, userId)))
		.limit(1);
	if (!owner) throw new ApiError(404, "Thread not found", "thread_not_found");

	// Backfill HTML bodies for messages synced before we stored HTML.
	await ensureThreadHtml(threadId);

	const rows = await db
		.select()
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(asc(messages.internalDate));

	return {
		id: thread.id,
		subject: thread.subject,
		messages: rows.map((m) => ({
			id: m.id,
			fromName: m.fromName,
			fromAddress: m.fromAddress,
			toAddresses: m.toAddresses,
			subject: m.subject,
			bodyText: m.bodyText,
			bodyHtml: m.bodyHtml,
			snippet: m.snippet,
			internalDate: m.internalDate ? m.internalDate.toISOString() : null,
			unread: m.isUnread,
		})),
	};
}
