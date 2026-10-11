import { AlertCircle, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useMailboxes, useSyncMailbox } from "../hooks";

/** Slim, non-blocking banner while any mailbox is still doing its first sync. */
export function SyncBanner() {
	const mailboxes = useMailboxes();
	const sync = useSyncMailbox();
	const busy = mailboxes.data?.find((m) => m.status === "pending" || m.status === "syncing");
	const failed = mailboxes.data?.find((m) => m.status === "error");
	const m = failed ?? busy;
	if (!m) return null;

	return (
		<div className="bg-primary/[0.06]" data-testid="sync-banner">
			<div className="flex items-center gap-3 px-4 py-2 text-sm">
				{m.status === "error" ? (
					<>
						<AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
						<span className="min-w-0 truncate text-muted-foreground">
							Sync paused for {m.emailAddress}. {m.error ?? "Something went wrong."}
						</span>
						<button
							type="button"
							className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-medium hover:underline"
							onClick={() => sync.mutate(m.id)}
						>
							<RefreshCw className="h-3.5 w-3.5" />
							Try again
						</button>
					</>
				) : (
					<>
						<Spinner className="h-4 w-4 shrink-0 text-primary" />
						<span className="truncate">Syncing {m.emailAddress}</span>
						<span className="hidden text-muted-foreground sm:inline">{m.syncedCount} messages so far</span>
						<span className="ml-auto hidden text-xs text-muted-foreground md:inline">You can keep working.</span>
					</>
				)}
			</div>
		</div>
	);
}
