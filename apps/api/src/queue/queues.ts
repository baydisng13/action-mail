import type { JobsOptions } from "bullmq";

export const QUEUES = {
	sync: "sync",
	ai: "ai",
	email: "email",
	billing: "billing",
	maintenance: "maintenance",
	mailAction: "mail-action",
	send: "send",
	draft: "draft",
} as const;

export type SyncJob = { type: "backfill" | "incremental"; mailboxId: string; step?: number };
export type AiJob = { type: "triage"; organizationId: string; userId: string };
export type EmailJob = { to: string; subject: string; html: string; text: string };
export type BillingJob = { eventId: string };
export type MailActionJob = {
	mailboxId: string;
	action: import("@postscript/types").ThreadAction;
	target: { providerId: string; role: string } | null;
	providerThreadIds: string[];
	items: Array<{
		messageId: string;
		providerMessageId: string;
		folder: string | null;
		uid: number | null;
		toFolder: string | null;
		toRole: string | null;
		flags: { unread: boolean; starred: boolean } | null;
		remove: boolean;
	}>;
};
export type SendJob = { outboxId: string };
export type DraftJob = { draftId: string; version: number };
export type MaintenanceJob = { type: "sync-all" | "cleanup" | "unsnooze" };

export const DEFAULT_JOB: JobsOptions = {
	attempts: 3,
	backoff: { type: "exponential", delay: 5_000 },
	removeOnComplete: true,
	removeOnFail: { count: 500 },
};

/** BullMQ job ids must not contain ":" (it builds keys as bull:<queue>:<id>). */
export function jobId(...parts: Array<string | number>): string {
	return parts.map((p) => String(p).replace(/:/g, "-")).join("-");
}
