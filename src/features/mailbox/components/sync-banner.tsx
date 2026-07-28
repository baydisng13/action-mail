import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useMailboxStatus, useStartSync } from "../hooks";

/**
 * Slim, non-blocking banner showing background backfill progress. Polls status,
 * ensures the sync is running, and quietly disappears once the inbox is ready.
 */
export function SyncBanner({ mailboxId }: { mailboxId: string | undefined }) {
	const status = useMailboxStatus(mailboxId, Boolean(mailboxId));
	const startSync = useStartSync();

	const state = status.data?.status;
	const synced = status.data?.syncedCount ?? 0;

	// Resilience: start the backfill if it's not running, and auto-resume an
	// orphaned chain (status "syncing" but the count hasn't moved for a while,
	// e.g. a serverless step died). Safe to re-kick — ingestion is idempotent.
	const lastCount = useRef(synced);
	const lastMovedAt = useRef<number>(Date.now());
	useEffect(() => {
		if (!mailboxId) return;
		const now = Date.now();
		if (synced !== lastCount.current) {
			lastCount.current = synced;
			lastMovedAt.current = now;
		}
		const stalled = now - lastMovedAt.current > 15_000;
		if (state === "pending" || state === "error" || (state === "syncing" && stalled)) {
			startSync.mutate(mailboxId);
			lastMovedAt.current = now;
		}
	}, [mailboxId, state, synced, startSync]);

	if (!mailboxId || !state || state === "ready") return null;

	return (
		<div className="border-b border-primary/20 bg-primary/[0.06]">
			<div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-2.5 text-sm">
				{state === "error" ? (
					<>
						<AlertCircle className="h-4 w-4 text-destructive" />
						<span className="text-muted-foreground">
							Sync paused — {status.data?.error ?? "an error occurred"}.
						</span>
						<button
							type="button"
							className="ml-auto inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
							onClick={() => mailboxId && startSync.mutate(mailboxId)}
						>
							<RefreshCw className="h-3.5 w-3.5" />
							Resume
						</button>
					</>
				) : (
					<>
						<Spinner className="h-4 w-4 text-primary" />
						<span className="text-foreground">Reading your inbox</span>
						<span className="text-muted-foreground">
							· {synced} messages so far
						</span>
						<span className="ml-auto text-xs text-muted-foreground">
							You can keep exploring — this runs in the background.
						</span>
					</>
				)}
			</div>
		</div>
	);
}

/** Brief "inbox ready" confirmation, shown once a sync flips to ready. */
export function SyncReadyToast({ mailboxId }: { mailboxId: string | undefined }) {
	const status = useMailboxStatus(mailboxId, Boolean(mailboxId));
	if (status.data?.status !== "ready") return null;
	return (
		<div className="flex items-center gap-2 text-xs text-primary">
			<CheckCircle2 className="h-3.5 w-3.5" />
			Inbox synced
		</div>
	);
}
