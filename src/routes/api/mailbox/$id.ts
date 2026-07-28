import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { disconnectMailbox } from "@/server/services/mailbox";

export const Route = createFileRoute("/api/mailbox/$id")({
	server: {
		handlers: {
			// Disconnect + purge all synced content (PRD §10).
			DELETE: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const id = new URL(request.url).pathname.split("/").filter(Boolean)[2];
				await disconnectMailbox(claims.sub, id);
				return json({ ok: true });
			}),
		},
	},
});
