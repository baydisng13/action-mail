import { z } from "zod";

export const CATEGORIES = [
	"all",
	"primary",
	"promotions",
	"social",
	"updates",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
	all: "All",
	primary: "Primary",
	promotions: "Promotions",
	social: "Social",
	updates: "Updates",
};

export const threadListItem = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	snippet: z.string().nullable(),
	lastMessageAt: z.string().nullable(),
	messageCount: z.number(),
	fromName: z.string().nullable(),
	fromAddress: z.string().nullable(),
	unread: z.boolean(),
	category: z.enum(CATEGORIES),
});

export const inboxResponse = z.object({
	threads: z.array(threadListItem),
});

export const threadMessage = z.object({
	id: z.string(),
	fromName: z.string().nullable(),
	fromAddress: z.string().nullable(),
	toAddresses: z.array(z.string()).nullable(),
	subject: z.string().nullable(),
	bodyText: z.string().nullable(),
	bodyHtml: z.string().nullable(),
	snippet: z.string().nullable(),
	internalDate: z.string().nullable(),
	unread: z.boolean(),
});

export const threadSummaryResponse = z.object({
	summaries: z.array(z.object({ messageId: z.string(), summary: z.string() })),
});
export type MessageSummary = { messageId: string; summary: string };

export const threadResponse = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	messages: z.array(threadMessage),
});

export type ThreadListItem = z.infer<typeof threadListItem>;
export type ThreadMessage = z.infer<typeof threadMessage>;
export type ThreadDetail = z.infer<typeof threadResponse>;

// ─── Action extraction (PRD §6.4) ─────────────────────────────────────────────
export const extractedAction = z.object({
	label: z.string(),
	url: z.string(),
	verb: z.enum([
		"open",
		"verify",
		"reset",
		"confirm",
		"pay",
		"view",
		"track",
		"download",
		"unsubscribe",
	]),
	suspicious: z.boolean(),
});

export const extractionResult = z.object({
	isTransactional: z.boolean(),
	otp: z.string().nullable(),
	actions: z.array(extractedAction),
	summary: z.string(),
});

export const messageActions = z.object({
	messageId: z.string(),
	result: extractionResult,
});

export const actionsResponse = z.object({
	actions: z.array(messageActions),
});

export type ExtractedAction = z.infer<typeof extractedAction>;
export type MessageActions = z.infer<typeof messageActions>;
