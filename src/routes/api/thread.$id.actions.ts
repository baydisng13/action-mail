import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { getThreadActions } from "@/server/services/ai-actions";

export const Route = createFileRoute("/api/thread/$id/actions")({
	server: {
		handlers: {
			// Extract (or reuse cached) OTP codes + action links for a thread.
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const id = new URL(request.url).pathname.split("/").filter(Boolean)[2];
				return json({ actions: await getThreadActions(claims.sub, id) });
			}),
		},
	},
});
