import { createFileRoute } from "@tanstack/react-router";
import { handler, json } from "@/server/lib/http";
import { forgotPassword } from "@/server/services/auth";

export const Route = createFileRoute("/api/auth/forgot-password")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				await forgotPassword(await request.json());
				// Always ok — never reveal whether the email exists.
				return json({ ok: true });
			}),
		},
	},
});
