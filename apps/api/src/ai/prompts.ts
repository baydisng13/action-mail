import { z } from "zod";
import { generateStructured } from "./provider";

// ─── Action extraction (PRD §6.4 ⭐) ──────────────────────────────────────────
export const extractedAction = z.object({
	label: z
		.string()
		.describe("Short button label, e.g. 'Verify email', 'Reset password'"),
	url: z.string().describe("The destination URL"),
	verb: z
		.enum([
			"open",
			"verify",
			"reset",
			"confirm",
			"pay",
			"view",
			"track",
			"download",
			"unsubscribe",
		])
		.describe("The kind of action the link performs"),
	suspicious: z
		.boolean()
		.describe(
			"True if the link looks risky: mismatched/lookalike domain, urgent scare language, or an unexpected sender",
		),
});

export const extractedTodo = z.object({
	title: z
		.string()
		.describe("Imperative task, e.g. 'Reply to HR about interview time'"),
	dueAt: z
		.string()
		.nullable()
		.describe("ISO 8601 date/time of the deadline if stated/implied, else null"),
});

export const extractionResult = z.object({
	isTransactional: z
		.boolean()
		.describe("True if this is transactional mail with a code or action"),
	otp: z
		.string()
		.nullable()
		.describe("The one-time / verification / 2FA code, digits only, or null"),
	actions: z
		.array(extractedAction)
		.describe("The primary actions a user would take from this email"),
	todo: extractedTodo
		.nullable()
		.describe(
			"A task the USER must personally do (reply, decide, pay, submit, RSVP, attend). null if the email needs no personal action.",
		),
	summary: z.string().describe("One short sentence: what this email wants"),
});

export type ExtractionResult = z.infer<typeof extractionResult>;
export type ExtractedTodo = z.infer<typeof extractedTodo>;

const EXTRACT_SYSTEM = `You pull the primary action(s) out of an email so the user can act without reading it.

Rules:
- If the email contains a one-time code / verification / OTP / 2FA / PIN, put ONLY the code in "otp" (digits or short alphanumeric, no words). Otherwise otp=null.
- Put the 1-3 MOST IMPORTANT links in "actions" with a short human label (from the link's anchor text) and the correct verb. Examples: "Verify email" (verify), "Reset password" (reset), "View job" (view), "Track order" (track), "Pay invoice" (pay), "Open dashboard" (open), "Download receipt" (download).
- IGNORE noise links: unsubscribe, manage/update preferences, privacy/terms/legal, social-media icons, "view in browser", and app-store badges — UNLESS the whole email is literally about unsubscribing.
- Mark "suspicious": true when a link's domain doesn't match the apparent sender, uses look-alike characters, or the email uses pressure/scare tactics. Note: many senders wrap links through a tracking/redirect domain (e.g. links.brand.com, sendgrid, mailchimp) — that alone is NOT suspicious.
- "isTransactional": true only for codes, verification, security, receipts/orders, or account actions. Newsletters/promos/updates are false but can still have actions.
- "todo": set it ONLY when the email needs the USER to personally do something (reply, decide, pay, submit, RSVP, attend, review by a date). Write an imperative title. If a deadline is stated or clearly implied, set dueAt as an ISO 8601 date (today is {TODAY}); otherwise dueAt=null. Newsletters, receipts, promos, and pure FYIs get todo=null.
- If there is genuinely nothing worth acting on, return actions=[], otp=null, todo=null.
- "summary" is one short plain sentence.
- Never invent codes, URLs, or tasks. Only use what appears in the email.`;

export interface EmailForExtraction {
	from: string;
	subject: string;
	body: string;
}

/** Extract OTP codes + actionable links from a (transactional) email. */
// ─── Summarize (for the AI-summary view) ──────────────────────────────────────
const summarySchema = z.object({
	summary: z.string().describe("2-4 concise sentences, plain text"),
});

const SUMMARIZE_SYSTEM = `Summarize this email for someone who hasn't opened it. 2-4 short plain-text sentences: what it's about, the key details, and any action the reader needs to take. No preamble, no markdown.`;

export async function summarizeEmail(email: EmailForExtraction): Promise<string> {
	const body = email.body.slice(0, 6000);
	const user = `From: ${email.from}\nSubject: ${email.subject}\n\n${body}`;
	const r = await generateStructured(SUMMARIZE_SYSTEM, user, summarySchema);
	return r.summary.trim();
}

export async function extractActions(
	email: EmailForExtraction,
): Promise<ExtractionResult> {
	const body = email.body.slice(0, 4000);
	const today = new Date().toISOString().slice(0, 10);
	const system = EXTRACT_SYSTEM.replace("{TODAY}", today);
	const user = `From: ${email.from}
Subject: ${email.subject}

${body}`;
	return generateStructured(system, user, extractionResult);
}
