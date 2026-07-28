import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { type Category, listThreads } from "@/server/services/inbox";

const CATEGORIES = ["all", "primary", "promotions", "social", "updates"];

export const Route = createFileRoute("/api/inbox")({
	server: {
		handlers: {
			GET: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const url = new URL(request.url);
				const catParam = url.searchParams.get("category") ?? "all";
				const category = (
					CATEGORIES.includes(catParam) ? catParam : "all"
				) as Category;
				const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
				const mailboxId = url.searchParams.get("mailboxId") || null;
				const threads = await listThreads(claims.sub, {
					category,
					offset,
					mailboxId,
				});
				return json({ threads });
			}),
		},
	},
});
