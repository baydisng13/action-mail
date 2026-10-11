import { Inject, Injectable } from "@nestjs/common";
import type { ExtractionResult, MessageActions, MessageSummary } from "@postscript/types";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { LimitsService } from "../billing/limits.service";
import { orgCipher } from "../common/crypto";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { features } from "../config/env";
import { DB, type Db } from "../db/db";
import { type Mailbox, mailboxes, type Message, messages, type Organization, organizations } from "../db/schema";
import type { LiveBody } from "../mail/body";
import type { Envelope } from "../mail/ingest.service";
import type { MailScope } from "../mail/mailbox.service";
import { formatAddress, htmlToText } from "../mail/mime";
import { ReadService } from "../mail/read.service";
import { TodosService } from "../todos/todos.service";
import { extractActions, summarizeEmail } from "./prompts";

const EMPTY: ExtractionResult = { isTransactional: false, otp: null, actions: [], todo: null, summary: "" };

const TRANSACTIONAL_KW =
	/\b(verif|otp|one[- ]?time|2fa|two[- ]?factor|passcode|security code|confirm|activat|reset|sign[- ]?in|log[- ]?in|receipt|invoice|order #|payment|booking|magic link|deadline|due|rsvp|please reply|action required)/i;
const CODE_NEAR_WORD =
	/\b(code|otp|pin|passcode|password|verification|verify|one[- ]?time)\b[^0-9]{0,40}\d{3,8}|\d{3,8}[^0-9]{0,20}\b(is your|verification|security)\b/i;

/** Spend an AI call only on mail with something to act on. Exported for tests. */
export function hasActionableContent(subject: string | null, from: string | null, body: string | null): boolean {
	if (TRANSACTIONAL_KW.test(`${subject ?? ""} ${from ?? ""}`)) return true;
	if (!body) return false;
	return /https?:\/\//i.test(body) || CODE_NEAR_WORD.test(body);
}

function bodyText(b: LiveBody | null): string {
	if (!b) return "";
	return (b.text?.trim() ? b.text : b.html ? htmlToText(b.html) : "").slice(0, 8000);
}

/**
 * AI features. Content goes to the model only on demand (or in paid triage),
 * straight from the provider fetch; only the AI output is stored, encrypted.
 */
@Injectable()
export class AiService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly read: ReadService,
		private readonly limits: LimitsService,
		private readonly todos: TodosService,
	) {}

	private async extractAndCache(org: Organization, mb: Mailbox, m: Message, body: LiveBody | null): Promise<ExtractionResult | null> {
		const cipher = orgCipher(org.id);
		if (m.aiProcessedAt) return cipher.dec<ExtractionResult>(m.aiActionsEnc) ?? EMPTY;
		const env = cipher.dec<Envelope>(m.envelopeEnc);
		const text = bodyText(body);
		if (!features.ai() || !hasActionableContent(env?.subject ?? null, env?.from?.address ?? null, text)) {
			await this.db.update(messages).set({ aiActionsEnc: cipher.enc(EMPTY), aiProcessedAt: new Date() }).where(eq(messages.id, m.id));
			return EMPTY;
		}
		if (!body) return null;
		await this.limits.meterAi(org);
		let result: ExtractionResult;
		try {
			result = await extractActions({ from: env?.from ? formatAddress(env.from) : "unknown", subject: env?.subject ?? "", body: text });
		} catch (err) {
			log.warn("ai.extract_failed", { messageId: m.id, err: err as Error });
			return null;
		}
		await this.db.update(messages).set({ aiActionsEnc: cipher.enc(result), aiProcessedAt: new Date() }).where(eq(messages.id, m.id));
		return result;
	}

	private async org(orgId: string): Promise<Organization> {
		const [o] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
		return o;
	}

	async threadActions(scope: MailScope, threadId: string): Promise<MessageActions[]> {
		const { t, mb } = await this.read.requireThread(scope, threadId);
		const org = await this.org(scope.orgId);
		const list = (await this.read.threadMessages(t.id, scope.orgId)).filter((m) => !m.isDraft);
		const pending = list.filter((m) => !m.aiProcessedAt);
		const bodies = pending.length ? await this.read.fetchBodies(mb, pending) : new Map<string, LiveBody>();
		const out: MessageActions[] = [];
		for (const m of list) {
			const r = await this.extractAndCache(org, mb, m, bodies.get(m.id) ?? null);
			if (!r) continue;
			if (r.todo) await this.todos.upsertAi(scope, m.id, m.threadId, r.todo);
			if (r.otp || r.actions.length) out.push({ messageId: m.id, result: r });
		}
		return out;
	}

	async threadSummary(scope: MailScope, threadId: string): Promise<MessageSummary[]> {
		if (!features.ai()) throw new ApiError(503, "AI is not configured yet", "ai_unconfigured");
		const { t, mb } = await this.read.requireThread(scope, threadId);
		const org = await this.org(scope.orgId);
		const cipher = orgCipher(scope.orgId);
		const list = (await this.read.threadMessages(t.id, scope.orgId)).filter((m) => !m.isDraft);
		const missing = list.filter((m) => !m.aiSummaryEnc);
		const bodies = missing.length ? await this.read.fetchBodies(mb, missing) : new Map<string, LiveBody>();
		const out: MessageSummary[] = [];
		for (const m of list) {
			const cached = cipher.dec<string>(m.aiSummaryEnc);
			if (cached) {
				out.push({ messageId: m.id, summary: cached });
				continue;
			}
			const text = bodyText(bodies.get(m.id) ?? null);
			if (!text.trim()) continue;
			await this.limits.meterAi(org);
			const env = cipher.dec<Envelope>(m.envelopeEnc);
			try {
				const summary = await summarizeEmail({ from: env?.from ? formatAddress(env.from) : "unknown", subject: env?.subject ?? "", body: text });
				await this.db.update(messages).set({ aiSummaryEnc: cipher.enc(summary) }).where(eq(messages.id, m.id));
				out.push({ messageId: m.id, summary });
			} catch (err) {
				log.warn("ai.summary_failed", { messageId: m.id, err: err as Error });
			}
		}
		return out;
	}

	/** Look through recent unprocessed inbox mail for to-dos (bounded). */
	async scanTodos(scope: MailScope, limit = 10): Promise<{ scanned: number; created: number }> {
		if (!features.ai()) return { scanned: 0, created: 0 };
		const org = await this.org(scope.orgId);
		const since = new Date(Date.now() - 14 * 86400_000);
		const rows = await this.db
			.select({ m: messages, mb: mailboxes })
			.from(messages)
			.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
			.where(
				and(
					eq(messages.organizationId, scope.orgId),
					eq(mailboxes.organizationId, scope.orgId),
					eq(mailboxes.userId, scope.userId),
					isNull(messages.aiProcessedAt),
					gte(messages.internalDate, since),
					sql`${messages.roles} ? 'inbox'`,
				),
			)
			.orderBy(desc(messages.internalDate))
			.limit(limit * 3);
		let scanned = 0;
		let created = 0;
		for (const { m, mb } of rows) {
			if (scanned >= limit) break;
			const env = orgCipher(scope.orgId).dec<Envelope>(m.envelopeEnc);
			// Cheap pre-filter on the envelope first, then the body from the provider.
			if (!hasActionableContent(env?.subject ?? null, env?.from?.address ?? null, env?.snippet ?? null)) {
				const body = await this.read.fetchBody(mb, m);
				if (!hasActionableContent(env?.subject ?? null, env?.from?.address ?? null, bodyText(body))) continue;
				scanned++;
				const r = await this.extractAndCache(org, mb, m, body);
				if (r?.todo && (await this.todos.upsertAi(scope, m.id, m.threadId, r.todo))) created++;
				continue;
			}
			scanned++;
			const r = await this.extractAndCache(org, mb, m, await this.read.fetchBody(mb, m));
			if (r?.todo && (await this.todos.upsertAi(scope, m.id, m.threadId, r.todo))) created++;
		}
		return { scanned, created };
	}
}
