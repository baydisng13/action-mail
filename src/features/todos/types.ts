import { z } from "zod";

export const todoView = z.object({
	id: z.string(),
	title: z.string(),
	notes: z.string().nullable(),
	dueAt: z.string().nullable(),
	status: z.enum(["open", "done"]),
	source: z.enum(["ai", "manual"]),
	threadId: z.string().nullable(),
	messageId: z.string().nullable(),
	completedAt: z.string().nullable(),
	createdAt: z.string(),
});

export const todosResponse = z.object({ todos: z.array(todoView) });
export const scanResult = z.object({ scanned: z.number(), created: z.number() });

export type TodoView = z.infer<typeof todoView>;
export type Bucket = "today" | "week" | "someday";
