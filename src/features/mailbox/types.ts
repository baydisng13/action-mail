import { z } from "zod";

export const syncStatusEnum = z.enum(["pending", "syncing", "ready", "error"]);

export const mailboxSummary = z.object({
	id: z.string(),
	provider: z.literal("gmail"),
	emailAddress: z.string(),
	status: syncStatusEnum,
	syncedCount: z.number(),
	totalEstimate: z.number().nullable(),
});

export const mailboxesResponse = z.object({
	mailboxes: z.array(mailboxSummary),
});

export const syncProgress = z.object({
	status: syncStatusEnum,
	syncedCount: z.number(),
	totalEstimate: z.number().nullable(),
	hasMore: z.boolean(),
	error: z.string().nullable().optional(),
});

export const connectUrlResponse = z.object({ url: z.string() });

export type MailboxSummary = z.infer<typeof mailboxSummary>;
export type SyncProgress = z.infer<typeof syncProgress>;
