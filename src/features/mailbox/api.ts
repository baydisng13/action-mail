import { apiClient } from "@/lib/api-client";
import type { ImapConnectInput } from "./schemas";
import {
	connectUrlResponse,
	type MailboxSummary,
	mailboxesResponse,
	type SyncProgress,
	syncProgress,
} from "./types";

export const mailboxApi = {
	/** Get the Gmail consent URL (server sets the signed state cookie). */
	async startConnect(): Promise<string> {
		const res = await apiClient.post("/api/mailbox/google");
		return connectUrlResponse.parse(res.data).url;
	},

	/** Connect an IMAP/SMTP mailbox (verifies creds server-side). */
	async connectImap(input: ImapConnectInput): Promise<{ mailboxId: string }> {
		const res = await apiClient.post("/api/mailbox/imap", input);
		return res.data as { mailboxId: string };
	},

	async list(): Promise<MailboxSummary[]> {
		const res = await apiClient.get("/api/mailboxes");
		return mailboxesResponse.parse(res.data).mailboxes;
	},

	/** Kick off a background backfill (returns immediately). */
	async startSync(id: string): Promise<void> {
		await apiClient.post(`/api/mailbox/${id}/sync/start`);
	},

	/** Fetch-on-open incremental pull. */
	async refresh(id: string): Promise<{ added: number }> {
		const res = await apiClient.post(`/api/mailbox/${id}/refresh`);
		return res.data as { added: number };
	},

	async status(id: string): Promise<SyncProgress> {
		const res = await apiClient.get(`/api/mailbox/${id}/status`);
		return syncProgress.parse(res.data);
	},

	async disconnect(id: string): Promise<void> {
		await apiClient.delete(`/api/mailbox/${id}`);
	},
};
