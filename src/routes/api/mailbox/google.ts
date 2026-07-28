import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";
import { requireAuth } from "@/server/lib/auth";
import { connectStateCookie, handler, json } from "@/server/lib/http";
import { signStateToken } from "@/server/lib/jwt";
import { buildConnectUrl } from "@/server/services/gmail-client";

export const Route = createFileRoute("/api/mailbox/google")({
	server: {
		handlers: {
			// Authenticated (bearer): returns the consent URL for the client to
			// navigate to. The signed state carries who is connecting.
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const nonce = randomBytes(12).toString("base64url");
				const state = await signStateToken({
					sub: claims.sub,
					teamId: claims.activeTeamId,
					plan: claims.plan,
					nonce,
				});
				return json(
					{ url: buildConnectUrl(state) },
					{ headers: { "set-cookie": connectStateCookie(state) } },
				);
			}),
		},
	},
});
