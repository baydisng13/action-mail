import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { getThread } from "@/server/services/inbox";

export const Route = createFileRoute("/api/thread/$id")({
	server: {
		handlers: {
			GET: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const id = new URL(request.url).pathname.split("/").filter(Boolean)[2];
				return json(await getThread(claims.sub, id));
			}),
		},
	},
});
