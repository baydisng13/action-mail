import { apiClient } from "@/lib/api-client";
import { scanResult, type TodoView, todosResponse, todoView } from "./types";

export const todosApi = {
	async list(mailboxId?: string | null): Promise<TodoView[]> {
		const res = await apiClient.get("/api/todos", {
			params: mailboxId ? { mailboxId } : {},
		});
		return todosResponse.parse(res.data).todos;
	},
	async create(input: {
		title: string;
		notes?: string;
		dueAt?: string | null;
	}): Promise<TodoView> {
		const res = await apiClient.post("/api/todos", input);
		return todoView.parse(res.data);
	},
	async patch(
		id: string,
		input: {
			status?: "open" | "done";
			title?: string;
			notes?: string | null;
			dueAt?: string | null;
		},
	): Promise<TodoView> {
		const res = await apiClient.patch(`/api/todos/${id}`, input);
		return todoView.parse(res.data);
	},
	async remove(id: string): Promise<void> {
		await apiClient.delete(`/api/todos/${id}`);
	},
	async scan(): Promise<{ scanned: number; created: number }> {
		const res = await apiClient.post("/api/todos/scan");
		return scanResult.parse(res.data);
	},
};
