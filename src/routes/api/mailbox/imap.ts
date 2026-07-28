import { createFileRoute } from "@tanstack/react-router";
import { imapConnectSchema } from "@/features/mailbox/schemas";
import { requireAuth } from "@/server/lib/auth";
import { handler, json } from "@/server/lib/http";
import { connectImap, startBackfill } from "@/server/services/mailbox";

export const Route = createFileRoute("/api/mailbox/imap")({
	server: {
		handlers: {
			// Authenticated form POST (no OAuth redirect). Verifies creds, stores
			// the mailbox, kicks off background sync.
			POST: handler(async ({ request }) => {
				const claims = await requireAuth(request);
				const input = imapConnectSchema.parse(await request.json());
				const { mailboxId } = await connectImap(
					claims.sub,
					claims.activeTeamId,
					claims.plan,
					input,
				);
				await startBackfill(claims.sub, mailboxId);
				return json({ mailboxId }, { status: 201 });
			}),
		},
	},
});
