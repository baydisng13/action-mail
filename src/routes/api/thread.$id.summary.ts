import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { getThreadSummary } from "@/server/services/ai-actions";

export const Route = createFileRoute("/api/thread/$id/summary")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const id = new URL(request.url).pathname.split("/").filter(Boolean)[2];
				return json({ summaries: await getThreadSummary(claims.sub, id) });
			}),
		},
	},
});
