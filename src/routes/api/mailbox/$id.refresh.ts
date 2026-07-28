import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { incrementalRefresh } from "@/server/services/mailbox";

export const Route = createFileRoute("/api/mailbox/$id/refresh")({
	server: {
		handlers: {
			// Fetch-on-open incremental: pull mail added since the last cursor.
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const id = new URL(request.url).pathname.split("/").filter(Boolean)[2];
				return json(await incrementalRefresh(claims.sub, id));
			}),
		},
	},
});
