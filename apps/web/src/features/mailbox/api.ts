import type { ImapConnectInput, MailboxSummary } from "@postscript/types";
import { apiClient } from "@/lib/api-client";

export const mailboxApi = {
	/** Gmail consent URL (the api sets the signed state cookie). */
	async startConnect(): Promise<string> {
		return (await apiClient.post<{ url: string }>("/api/mailbox/google")).data.url;
	},
	async connectImap(input: ImapConnectInput): Promise<{ mailboxId: string }> {
		return (await apiClient.post<{ mailboxId: string }>("/api/mailbox/imap", input)).data;
	},
	async list(): Promise<MailboxSummary[]> {
		return (await apiClient.get<{ mailboxes: MailboxSummary[] }>("/api/mailboxes")).data.mailboxes;
	},
	async update(id: string, input: { displayName?: string | null; signatureHtml?: string | null }): Promise<void> {
		await apiClient.patch(`/api/mailboxes/${id}`, input);
	},
	async sync(id: string): Promise<void> {
		await apiClient.post(`/api/mailboxes/${id}/sync`);
	},
	async disconnect(id: string): Promise<void> {
		await apiClient.delete(`/api/mailboxes/${id}`);
	},
};
