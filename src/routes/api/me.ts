import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { getMe } from "@/server/services/account";

export const Route = createFileRoute("/api/me")({
	server: {
		handlers: {
			GET: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const me = await getMe(claims.sub, claims.activeTeamId);
				return json(me);
			}),
		},
	},
});
