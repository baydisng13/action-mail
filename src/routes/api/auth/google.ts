import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";
import { handler, oauthStateCookie } from "@/server/lib/http";
import { buildAuthUrl } from "@/server/services/google";

export const Route = createFileRoute("/api/auth/google")({
	server: {
		handlers: {
			// Kick off the OAuth flow: set a CSRF state cookie, redirect to Google.
			GET: handler(async () => {
				const state = randomBytes(16).toString("base64url");
				return new Response(null, {
					status: 302,
					headers: {
						location: buildAuthUrl(state),
						"set-cookie": oauthStateCookie(state),
					},
				});
			}),
		},
	},
});
