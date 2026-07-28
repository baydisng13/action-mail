import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { listMailboxes } from "@/server/services/mailbox";

export const Route = createFileRoute("/api/mailboxes")({
	server: {
		handlers: {
			GET: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				return json({ mailboxes: await listMailboxes(claims.sub) });
			}),
		},
	},
});
