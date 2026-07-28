import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { startBackfill } from "@/server/services/mailbox";

export const Route = createFileRoute("/api/mailbox/$id/sync/start")({
	server: {
		handlers: {
			// Kick off a background backfill and return immediately.
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const parts = new URL(request.url).pathname.split("/").filter(Boolean);
				const id = parts[2]; // /api/mailbox/<id>/sync/start
				await startBackfill(claims.sub, id);
				return json({ ok: true });
			}),
		},
	},
});
