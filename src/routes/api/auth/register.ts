import { createFileRoute } from "@tanstack/react-router";
import { handler, json } from "@/server/lib/http";
import { register } from "@/server/services/auth";

export const Route = createFileRoute("/api/auth/register")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				const body = await request.json();
				const { userId } = await register(body);
				return json({ userId, needsVerification: true }, { status: 201 });
			}),
		},
	},
});
