import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { syncBatch } from "@/server/services/mailbox";

export const Route = createFileRoute("/api/mailbox/$id/sync")({
	server: {
		handlers: {
			// Process one backfill batch. Client calls repeatedly until !hasMore.
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const id = new URL(request.url).pathname.split("/").filter(Boolean)[2];
				return json(await syncBatch(claims.sub, id));
			}),
		},
	},
});
