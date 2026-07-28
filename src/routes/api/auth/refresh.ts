import { createFileRoute } from "@tanstack/react-router";
import {
	ApiError,
	clearRefreshCookie,
	getCookie,
	handler,
	json,
	refreshCookie,
	REFRESH_COOKIE,
} from "@/server/lib/http";
import { rotateSession } from "@/server/services/session";

export const Route = createFileRoute("/api/auth/refresh")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				const current = getCookie(request, REFRESH_COOKIE);
				if (!current) {
					throw new ApiError(401, "No session", "no_session");
				}
				const rotated = await rotateSession(
					current,
					request.headers.get("user-agent"),
				);
				if (!rotated) {
					// Stale/reused token — clear the cookie so the client logs out.
					return json(
						{ error: { message: "Session expired", code: "session_expired" } },
						{ status: 401, headers: { "set-cookie": clearRefreshCookie() } },
					);
				}
				return json(
					{ accessToken: rotated.accessToken },
					{ headers: { "set-cookie": refreshCookie(rotated.refreshSecret) } },
				);
			}),
		},
	},
});
