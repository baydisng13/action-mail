import type { UsageSummary } from "@postscript/types";
import { cn } from "@/lib/utils";

function Meter({ label, used, limit, testId }: { label: string; used: number; limit: number; testId: string }) {
	const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
	return (
		<div data-testid={testId}>
			<div className="flex items-baseline justify-between text-sm">
				<span>{label}</span>
				<span className="tabular-nums text-muted-foreground">
					{used.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}
				</span>
			</div>
			<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
				<div className={cn("h-full rounded-full", pct >= 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
			</div>
		</div>
	);
}

export function UsageMeter({ usage }: { usage: UsageSummary }) {
	return (
		<div className="max-w-md space-y-4" data-testid="usage-meter">
			<Meter label="AI actions this month" used={usage.aiActionsUsed} limit={usage.aiActionsLimit} testId="usage-ai" />
			<Meter label="Mailboxes" used={usage.mailboxes} limit={usage.mailboxesLimit} testId="usage-mailboxes" />
			<Meter label="Seats" used={usage.seatsUsed} limit={usage.seatsLimit} testId="usage-seats" />
			<p className="text-xs text-muted-foreground">AI actions reset on the 1st of each month (UTC).</p>
		</div>
	);
}
