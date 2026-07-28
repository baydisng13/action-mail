import { createFileRoute } from "@tanstack/react-router";
import { handler, json, refreshCookie } from "@/server/lib/http";
import { login } from "@/server/services/auth";

export const Route = createFileRoute("/api/auth/login")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				const body = await request.json();
				const session = await login(
					body,
					request.headers.get("user-agent"),
				);
				return json(
					{ accessToken: session.accessToken },
					{ headers: { "set-cookie": refreshCookie(session.refreshSecret) } },
				);
			}),
		},
	},
});
