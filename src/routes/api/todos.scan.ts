import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { scanTodos } from "@/server/services/ai-actions";

export const Route = createFileRoute("/api/todos/scan")({
	server: {
		handlers: {
			// Bounded, user-triggered sweep of recent mail → to-dos.
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				return json(await scanTodos(claims.sub));
			}),
		},
	},
});
