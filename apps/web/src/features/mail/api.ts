import type {
	DraftContent,
	DraftView,
	FolderView,
	MessageActions,
	MessageSummary,
	SendResponse,
	ThreadActionInput,
	ThreadDetail,
	ThreadListResponse,
	ThreadsQuery,
	UploadView,
	ComposeMode,
} from "@postscript/types";
import { apiClient } from "@/lib/api-client";

export interface SearchParams {
	q: string;
	from?: string;
	mailboxId?: string;
	unread?: boolean;
	starred?: boolean;
	attachments?: boolean;
}

function clean<T extends object>(o: T): Partial<T> {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "")) as Partial<T>;
}

export const mailApi = {
	async folders(mailboxId?: string): Promise<FolderView[]> {
		return (await apiClient.get<{ folders: FolderView[] }>("/api/folders", { params: clean({ mailboxId }) })).data.folders;
	},
	async threads(q: ThreadsQuery): Promise<ThreadListResponse> {
		return (await apiClient.get<ThreadListResponse>("/api/threads", { params: clean(q) })).data;
	},
	async search(p: SearchParams): Promise<ThreadListResponse> {
		return (await apiClient.get<ThreadListResponse>("/api/search", { params: clean(p) })).data;
	},
	async thread(id: string, images: boolean): Promise<ThreadDetail> {
		return (await apiClient.get<ThreadDetail>(`/api/threads/${id}`, { params: images ? { images: 1 } : {} })).data;
	},
	async act(input: ThreadActionInput): Promise<void> {
		await apiClient.post("/api/threads/actions", input);
	},
	async aiActions(id: string): Promise<MessageActions[]> {
		return (await apiClient.get<{ actions: MessageActions[] }>(`/api/threads/${id}/ai/actions`)).data.actions;
	},
	async aiSummary(id: string): Promise<MessageSummary[]> {
		return (await apiClient.get<{ summaries: MessageSummary[] }>(`/api/threads/${id}/ai/summary`)).data.summaries;
	},
	async refresh(): Promise<void> {
		await apiClient.post("/api/mailboxes/refresh");
	},
	async createDraft(input: { mailboxId?: string; mode: ComposeMode; sourceMessageId?: string }): Promise<DraftView> {
		return (await apiClient.post<DraftView>("/api/drafts", input)).data;
	},
	async getDraft(id: string): Promise<DraftView> {
		return (await apiClient.get<DraftView>(`/api/drafts/${id}`)).data;
	},
	async saveDraft(id: string, content: DraftContent): Promise<{ version: number }> {
		return (await apiClient.put<{ version: number }>(`/api/drafts/${id}`, content)).data;
	},
	async deleteDraft(id: string): Promise<void> {
		await apiClient.delete(`/api/drafts/${id}`);
	},
	async send(id: string, content: DraftContent): Promise<SendResponse> {
		return (await apiClient.post<SendResponse>(`/api/drafts/${id}/send`, content)).data;
	},
	async undo(outboxId: string): Promise<{ draftId: string }> {
		return (await apiClient.post<{ draftId: string }>(`/api/outbox/${outboxId}/undo`)).data;
	},
	async upload(file: File, onProgress?: (pct: number) => void): Promise<UploadView> {
		const form = new FormData();
		form.append("file", file);
		const res = await apiClient.post<UploadView>("/api/uploads", form, {
			headers: { "content-type": "multipart/form-data" },
			onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
		});
		return res.data;
	},
};
