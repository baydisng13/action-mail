import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/env.server";
import { ApiError, handler, json } from "@/server/lib/http";
import { syncStep } from "@/server/services/mailbox";

/**
 * Self-continuing backfill step. Authenticated by the internal SYNC_SECRET
 * (never a user token) so it can be invoked by the scheduler or a cron.
 */
export const Route = createFileRoute("/api/internal/sync-step")({
	server: {
		handlers: {
			POST: handler(async ({ request }) => {
				if (request.headers.get("x-sync-secret") !== serverEnv.SYNC_SECRET) {
					throw new ApiError(401, "Forbidden", "bad_secret");
				}
				const { mailboxId } = (await request.json()) as { mailboxId?: string };
				if (!mailboxId) throw new ApiError(400, "mailboxId required");
				return json(await syncStep(mailboxId));
			}),
		},
	},
});
