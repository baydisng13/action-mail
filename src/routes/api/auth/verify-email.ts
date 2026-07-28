import { createFileRoute } from "@tanstack/react-router";
import { handler, json } from "@/server/lib/http";
import { verifyEmail } from "@/server/services/auth";

export const Route = createFileRoute("/api/auth/verify-email")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				await verifyEmail(await request.json());
				return json({ ok: true });
			}),
		},
	},
});
