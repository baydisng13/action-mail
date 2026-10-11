import type { CreateTodoInput, TodoView, UpdateTodoInput } from "@postscript/types";
import { apiClient } from "@/lib/api-client";

export const todosApi = {
	async list(mailboxId?: string | null): Promise<TodoView[]> {
		const res = await apiClient.get<{ todos: TodoView[] }>("/api/todos", { params: mailboxId ? { mailboxId } : {} });
		return res.data.todos;
	},
	async create(input: CreateTodoInput): Promise<TodoView> {
		return (await apiClient.post<TodoView>("/api/todos", input)).data;
	},
	async patch(id: string, input: UpdateTodoInput): Promise<TodoView> {
		return (await apiClient.patch<TodoView>(`/api/todos/${id}`, input)).data;
	},
	async remove(id: string): Promise<void> {
		await apiClient.delete(`/api/todos/${id}`);
	},
	async scan(): Promise<{ scanned: number; created: number }> {
		return (await apiClient.post<{ scanned: number; created: number }>("/api/todos/scan")).data;
	},
};
