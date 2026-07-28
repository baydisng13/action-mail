import { createFileRoute } from "@tanstack/react-router";
import {
	clearRefreshCookie,
	getCookie,
	handler,
	json,
	REFRESH_COOKIE,
} from "@/server/lib/http";
import { revokeSession } from "@/server/services/session";

export const Route = createFileRoute("/api/auth/logout")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				const current = getCookie(request, REFRESH_COOKIE);
				if (current) await revokeSession(current);
				return json(
					{ ok: true },
					{ headers: { "set-cookie": clearRefreshCookie() } },
				);
			}),
		},
	},
});
