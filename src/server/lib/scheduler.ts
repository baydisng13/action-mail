import { waitUntil } from "@vercel/functions";
import { serverEnv } from "@/env.server";

/**
 * Fire-and-forget trigger for the next self-continuing sync step. Returns
 * immediately; the actual work runs in a fresh serverless invocation.
 *
 * On Vercel, `waitUntil` keeps the current function alive long enough to
 * dispatch the request. Locally (long-running node) the fetch completes on its
 * own, so we simply don't await it.
 */
export function triggerSyncStep(mailboxId: string): void {
	const url = `${serverEnv.APP_URL}/api/internal/sync-step`;
	const promise = fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-sync-secret": serverEnv.SYNC_SECRET,
		},
		body: JSON.stringify({ mailboxId }),
	})
		.then((res) => {
			if (!res.ok) console.error("[sync] step returned", res.status);
		})
		.catch((err) => {
			console.error("[sync] failed to trigger next step", err);
		});

	// Only hand off to the platform keep-alive when actually on Vercel;
	// elsewhere the node event loop keeps the fetch alive on its own.
	if (process.env.VERCEL) {
		try {
			waitUntil(promise);
		} catch {
			void promise;
		}
	} else {
		void promise;
	}
}
