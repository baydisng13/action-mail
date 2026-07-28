import { createFileRoute } from "@tanstack/react-router";
import { changePasswordSchema } from "@/features/auth/schemas";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { changePassword } from "@/server/services/auth";

export const Route = createFileRoute("/api/auth/change-password")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const { currentPassword, newPassword } = changePasswordSchema.parse(
					await request.json(),
				);
				await changePassword(claims.sub, currentPassword, newPassword);
				return json({ ok: true });
			}),
		},
	},
});
