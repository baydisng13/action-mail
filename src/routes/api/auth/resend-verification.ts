import { createFileRoute } from "@tanstack/react-router";
import { handler, json } from "@/server/lib/http";
import { resendVerification } from "@/server/services/auth";

export const Route = createFileRoute("/api/auth/resend-verification")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				await resendVerification(await request.json());
				return json({ ok: true });
			}),
		},
	},
});
