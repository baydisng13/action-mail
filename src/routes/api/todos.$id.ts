import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { deleteTodo, setTodoStatus, updateTodo } from "@/server/services/todos";

function idFrom(request: Request): string {
	return new URL(request.url).pathname.split("/").filter(Boolean)[2];
}

export const Route = createFileRoute("/api/todos/$id")({
	server: {
		handlers: {
			PATCH: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const id = idFrom(request);
				const body = (await request.json()) as {
					status?: "open" | "done";
					title?: string;
					notes?: string | null;
					dueAt?: string | null;
				};
				if (body.status) {
					return json(await setTodoStatus(claims.sub, id, body.status));
				}
				return json(await updateTodo(claims.sub, id, body));
			}),
			DELETE: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				await deleteTodo(claims.sub, idFrom(request));
				return json({ ok: true });
			}),
		},
	},
});
