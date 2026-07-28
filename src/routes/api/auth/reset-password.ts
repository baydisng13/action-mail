import { createFileRoute } from "@tanstack/react-router";
import { handler, json } from "@/server/lib/http";
import { resetPassword } from "@/server/services/auth";

export const Route = createFileRoute("/api/auth/reset-password")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				await resetPassword(await request.json());
				return json({ ok: true });
			}),
		},
	},
});
