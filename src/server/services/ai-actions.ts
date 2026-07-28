import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { type Message, mailboxes, messages, threads } from "@/db/schema";
import { isAiConfigured } from "@/server/ai/provider";
import {
	extractActions,
	type ExtractionResult,
	summarizeEmail,
} from "@/server/ai/service";
import { ApiError } from "@/server/lib/http";
import { upsertAiTodo } from "./todos";

const EMPTY: ExtractionResult = {
	isTransactional: false,
	otp: null,
	actions: [],
	todo: null,
	summary: "",
};

// Prefix-style (no trailing \b) so "verify"/"verification"/"confirmation" match.
const TRANSACTIONAL_KW =
	/\b(verif|otp|one[- ]?time|2fa|two[- ]?factor|passcode|security code|confirm|activat|reset|sign[- ]?in|log[- ]?in|receipt|invoice|order #|payment|booking|magic link)/i;

const CODE_NEAR_WORD =
	/\b(code|otp|pin|passcode|password|verification|verify|one[- ]?time)\b[^0-9]{0,40}\d{3,8}|\d{3,8}[^0-9]{0,20}\b(is your|verification|security)\b/i;

/** Spend an AI call only on mail with something to act on (link/code/keyword). */
function hasActionableContent(
	subject: string | null,
	from: string | null,
	body: string | null,
): boolean {
	const hay = `${subject ?? ""} ${from ?? ""}`;
	if (TRANSACTIONAL_KW.test(hay)) return true;
	if (!body) return false;
	return /https?:\/\//i.test(body) || CODE_NEAR_WORD.test(body);
}

/**
 * Return the extraction result for a message — from cache, or by running the
 * model once (gated) and caching it. Always resolves; never re-runs a message.
 * Returns null only if the model call errored (left unprocessed to retry later).
 */
async function extractAndCache(m: Message): Promise<ExtractionResult | null> {
	if (m.aiProcessedAt) {
		return (m.aiActions as ExtractionResult) ?? EMPTY;
	}
	if (!isAiConfigured() || !hasActionableContent(m.subject, m.fromAddress, m.bodyText)) {
		await db
			.update(messages)
			.set({ aiActions: EMPTY, aiProcessedAt: new Date() })
			.where(eq(messages.id, m.id));
		return EMPTY;
	}
	let result: ExtractionResult;
	try {
		result = await extractActions({
			from: m.fromName ? `${m.fromName} <${m.fromAddress ?? ""}>` : m.fromAddress ?? "unknown",
			subject: m.subject ?? "",
			body: m.bodyText ?? m.snippet ?? "",
		});
	} catch (err) {
		console.error("[ai] extraction failed", err);
		return null;
	}
	await db
		.update(messages)
		.set({ aiActions: result, aiProcessedAt: new Date() })
		.where(eq(messages.id, m.id));
	return result;
}

async function assertThreadOwner(userId: string, threadId: string): Promise<void> {
	const [row] = await db
		.select({ id: threads.id })
		.from(threads)
		.innerJoin(mailboxes, eq(mailboxes.id, threads.mailboxId))
		.where(and(eq(threads.id, threadId), eq(mailboxes.userId, userId)))
		.limit(1);
	if (!row) throw new ApiError(404, "Thread not found", "thread_not_found");
}

export interface MessageActions {
	messageId: string;
	result: ExtractionResult;
}

/** Actions + todos for a thread (cached), run when the user opens it. */
export async function getThreadActions(
	userId: string,
	threadId: string,
): Promise<MessageActions[]> {
	await assertThreadOwner(userId, threadId);
	const rows = await db
		.select()
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(asc(messages.internalDate));

	const out: MessageActions[] = [];
	for (const m of rows) {
		const result = await extractAndCache(m);
		if (!result) continue;
		if (result.todo) {
			await upsertAiTodo(userId, m.id, m.threadId, result.todo);
		}
		if (result.otp || result.actions.length > 0) {
			out.push({ messageId: m.id, result });
		}
	}
	return out;
}

export interface MessageSummary {
	messageId: string;
	summary: string;
}

/** AI summary per message in a thread (lazy, cached on message.aiSummary). */
export async function getThreadSummary(
	userId: string,
	threadId: string,
): Promise<MessageSummary[]> {
	await assertThreadOwner(userId, threadId);
	if (!isAiConfigured()) return [];

	const rows = await db
		.select()
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(asc(messages.internalDate));

	const out: MessageSummary[] = [];
	for (const m of rows) {
		if (m.aiSummary) {
			out.push({ messageId: m.id, summary: m.aiSummary });
			continue;
		}
		const body = m.bodyText ?? m.snippet ?? "";
		if (!body.trim()) continue;
		try {
			const summary = await summarizeEmail({
				from: m.fromName ? `${m.fromName} <${m.fromAddress ?? ""}>` : m.fromAddress ?? "unknown",
				subject: m.subject ?? "",
				body,
			});
			await db
				.update(messages)
				.set({ aiSummary: summary })
				.where(eq(messages.id, m.id));
			out.push({ messageId: m.id, summary });
		} catch (err) {
			console.error("[ai] summary failed", err);
		}
	}
	return out;
}

/**
 * Proactively scan recent, unprocessed, actionable mail to populate the to-do
 * list. Bounded per call (user-triggered) so cost stays controlled.
 */
export async function scanTodos(
	userId: string,
	limit = 15,
): Promise<{ scanned: number; created: number }> {
	if (!isAiConfigured()) return { scanned: 0, created: 0 };
	const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

	const candidates = await db
		.select({ m: messages })
		.from(messages)
		.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
		.where(
			and(
				eq(mailboxes.userId, userId),
				isNull(messages.aiProcessedAt),
				gte(messages.internalDate, since),
			),
		)
		.orderBy(desc(messages.internalDate))
		.limit(60);

	let scanned = 0;
	let created = 0;
	for (const { m } of candidates) {
		if (scanned >= limit) break;
		if (!hasActionableContent(m.subject, m.fromAddress, m.bodyText)) continue;
		scanned++;
		const result = await extractAndCache(m);
		if (result?.todo) {
			await upsertAiTodo(userId, m.id, m.threadId, result.todo);
			created++;
		}
	}
	return { scanned, created };
}
