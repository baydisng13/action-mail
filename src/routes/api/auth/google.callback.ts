import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/env.server";
import {
	clearOauthStateCookie,
	getCookie,
	handler,
	OAUTH_STATE_COOKIE,
	refreshCookie,
} from "@/server/lib/http";
import { handleCallback } from "@/server/services/google";

/** Redirect back into the app, appending an outcome for the UI to react to. */
function appRedirect(path: string, extraCookies: string[] = []): Response {
	const headers = new Headers({ location: `${serverEnv.APP_URL}${path}` });
	for (const c of extraCookies) headers.append("set-cookie", c);
	return new Response(null, { status: 302, headers });
}

export const Route = createFileRoute("/api/auth/google/callback")({
	server: {
		handlers: {
			GET: handler(async ({ request }) => {
				const url = new URL(request.url);
				const code = url.searchParams.get("code");
				const state = url.searchParams.get("state");
				const expectedState = getCookie(request, OAUTH_STATE_COOKIE);

				if (url.searchParams.get("error")) {
					return appRedirect("/login?error=google_denied", [
						clearOauthStateCookie(),
					]);
				}
				if (!code || !state || !expectedState || state !== expectedState) {
					return appRedirect("/login?error=google_state", [
						clearOauthStateCookie(),
					]);
				}

				const session = await handleCallback(
					code,
					request.headers.get("user-agent"),
				);

				// Refresh cookie is set; the /auth/continue route swaps it for an
				// in-memory access token, then routes the user onward.
				return appRedirect("/auth/continue", [
					refreshCookie(session.refreshSecret),
					clearOauthStateCookie(),
				]);
			}),
		},
	},
});
