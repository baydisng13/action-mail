import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/env.server";
import {
	clearConnectStateCookie,
	CONNECT_STATE_COOKIE,
	getCookie,
	handler,
} from "@/server/lib/http";
import { verifyStateToken } from "@/server/lib/jwt";
import { connectGmail, startBackfill } from "@/server/services/mailbox";

function appRedirect(path: string): Response {
	return new Response(null, {
		status: 302,
		headers: {
			location: `${serverEnv.APP_URL}${path}`,
			"set-cookie": clearConnectStateCookie(),
		},
	});
}

export const Route = createFileRoute("/api/mailbox/google/callback")({
	server: {
		handlers: {
			GET: handler(async ({ request }) => {
				const url = new URL(request.url);
				const code = url.searchParams.get("code");
				const state = url.searchParams.get("state");
				const cookieState = getCookie(request, CONNECT_STATE_COOKIE);

				if (url.searchParams.get("error")) {
					return appRedirect("/onboarding?error=denied");
				}
				// State must be present, match the cookie, and verify (signature+exp).
				if (!code || !state || state !== cookieState) {
					return appRedirect("/onboarding?error=state");
				}
				const claims = await verifyStateToken(state);
				if (!claims?.sub) {
					return appRedirect("/onboarding?error=state");
				}

				try {
					const { mailboxId } = await connectGmail(
						claims.sub,
						claims.teamId,
						claims.plan as "free" | "pro" | "team",
						code,
					);
					// Kick off the backfill in the background, then drop the user
					// straight into the app — no blocking sync screen.
					await startBackfill(claims.sub, mailboxId);
					return appRedirect("/app");
				} catch (err) {
					console.error("[mailbox] gmail connect failed", err);
					const code2 =
						err && typeof err === "object" && "code" in err
							? (err as { code?: string }).code
							: undefined;
					return appRedirect(
						`/onboarding?error=${code2 === "mailbox_limit" ? "limit" : "connect"}`,
					);
				}
			}),
		},
	},
});
