import { apiClient } from "@/lib/api-client";
import {
	actionsResponse,
	type Category,
	inboxResponse,
	type MessageActions,
	type MessageSummary,
	type ThreadDetail,
	type ThreadListItem,
	threadResponse,
	threadSummaryResponse,
} from "./types";

export const inboxApi = {
	async list(
		category: Category,
		mailboxId?: string | null,
		offset = 0,
	): Promise<ThreadListItem[]> {
		const res = await apiClient.get("/api/inbox", {
			params: { category, offset, ...(mailboxId ? { mailboxId } : {}) },
		});
		return inboxResponse.parse(res.data).threads;
	},

	async thread(id: string): Promise<ThreadDetail> {
		const res = await apiClient.get(`/api/thread/${id}`);
		return threadResponse.parse(res.data);
	},

	/** Extract (or reuse cached) OTP codes + action links for a thread. */
	async actions(id: string): Promise<MessageActions[]> {
		const res = await apiClient.post(`/api/thread/${id}/actions`);
		return actionsResponse.parse(res.data).actions;
	},

	/** AI summary per message (lazy, cached). */
	async summary(id: string): Promise<MessageSummary[]> {
		const res = await apiClient.post(`/api/thread/${id}/summary`);
		return threadSummaryResponse.parse(res.data).summaries;
	},
};
