import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { getStatus } from "@/server/services/mailbox";

export const Route = createFileRoute("/api/mailbox/$id/status")({
	server: {
		handlers: {
			GET: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const id = new URL(request.url).pathname.split("/").filter(Boolean)[2];
				return json(await getStatus(claims.sub, id));
			}),
		},
	},
});
