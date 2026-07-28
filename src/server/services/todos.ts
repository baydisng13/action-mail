import { and, desc, eq, gte, or } from "drizzle-orm";
import { db } from "@/db";
import { messages, type Todo, todos } from "@/db/schema";
import type { ExtractedTodo } from "@/server/ai/service";
import { ApiError } from "@/server/lib/http";

export interface TodoView {
	id: string;
	title: string;
	notes: string | null;
	dueAt: string | null;
	status: "open" | "done";
	source: "ai" | "manual";
	threadId: string | null;
	messageId: string | null;
	completedAt: string | null;
	createdAt: string;
}

function toView(t: Todo): TodoView {
	return {
		id: t.id,
		title: t.title,
		notes: t.notes,
		dueAt: t.dueAt ? t.dueAt.toISOString() : null,
		status: t.status,
		source: t.source,
		threadId: t.threadId,
		messageId: t.messageId,
		completedAt: t.completedAt ? t.completedAt.toISOString() : null,
		createdAt: t.createdAt.toISOString(),
	};
}

/**
 * Open todos + anything completed in the last day (so checked items linger).
 * Optionally filter to AI todos sourced from a specific mailbox.
 */
export async function listTodos(
	userId: string,
	mailboxId?: string | null,
): Promise<TodoView[]> {
	const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const where = and(
		eq(todos.userId, userId),
		or(eq(todos.status, "open"), gte(todos.completedAt, dayAgo)),
		mailboxId ? eq(messages.mailboxId, mailboxId) : undefined,
	);

	const q = db.select({ t: todos }).from(todos);
	const rows = mailboxId
		? await q
				.innerJoin(messages, eq(messages.id, todos.messageId))
				.where(where)
				.orderBy(desc(todos.status), todos.dueAt, desc(todos.createdAt))
		: await q
				.where(where)
				.orderBy(desc(todos.status), todos.dueAt, desc(todos.createdAt));
	return rows.map((r) => toView(r.t));
}

export async function createTodo(
	userId: string,
	input: { title: string; notes?: string; dueAt?: string | null },
): Promise<TodoView> {
	const title = input.title.trim();
	if (!title) throw new ApiError(400, "Title is required", "title_required");
	const [row] = await db
		.insert(todos)
		.values({
			userId,
			title,
			notes: input.notes?.trim() || null,
			dueAt: input.dueAt ? new Date(input.dueAt) : null,
			source: "manual",
		})
		.returning();
	return toView(row);
}

async function owned(userId: string, id: string): Promise<Todo> {
	const [t] = await db
		.select()
		.from(todos)
		.where(and(eq(todos.id, id), eq(todos.userId, userId)))
		.limit(1);
	if (!t) throw new ApiError(404, "Todo not found", "todo_not_found");
	return t;
}

export async function setTodoStatus(
	userId: string,
	id: string,
	status: "open" | "done",
): Promise<TodoView> {
	await owned(userId, id);
	const [row] = await db
		.update(todos)
		.set({ status, completedAt: status === "done" ? new Date() : null })
		.where(eq(todos.id, id))
		.returning();
	return toView(row);
}

export async function updateTodo(
	userId: string,
	id: string,
	input: { title?: string; notes?: string | null; dueAt?: string | null },
): Promise<TodoView> {
	await owned(userId, id);
	const patch: Record<string, unknown> = {};
	if (input.title !== undefined) patch.title = input.title.trim();
	if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
	if (input.dueAt !== undefined)
		patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
	const [row] = await db
		.update(todos)
		.set(patch)
		.where(eq(todos.id, id))
		.returning();
	return toView(row);
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
	await owned(userId, id);
	await db.delete(todos).where(eq(todos.id, id));
}

/**
 * Create an AI-derived todo from a source message. Idempotent per message and
 * non-destructive: if one already exists (e.g. the user edited/completed it),
 * leave it alone.
 */
export async function upsertAiTodo(
	userId: string,
	messageId: string,
	threadId: string | null,
	todo: ExtractedTodo,
): Promise<void> {
	await db
		.insert(todos)
		.values({
			userId,
			title: todo.title.trim(),
			dueAt: todo.dueAt ? new Date(todo.dueAt) : null,
			source: "ai",
			messageId,
			threadId,
		})
		.onConflictDoNothing({ target: [todos.userId, todos.messageId] });
}
