import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { createTodo, listTodos } from "@/server/services/todos";

export const Route = createFileRoute("/api/todos")({
	server: {
		handlers: {
			GET: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const mailboxId = new URL(request.url).searchParams.get("mailboxId");
				return json({ todos: await listTodos(claims.sub, mailboxId) });
			}),
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const body = (await request.json()) as {
					title: string;
					notes?: string;
					dueAt?: string | null;
				};
				return json(await createTodo(claims.sub, body), { status: 201 });
			}),
		},
	},
});
