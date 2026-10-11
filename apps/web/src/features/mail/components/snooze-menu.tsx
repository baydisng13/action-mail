import { addDays, nextMonday, setHours, setMinutes, startOfHour } from "date-fns";
import { Timer } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function at(d: Date, h: number) {
	return setMinutes(setHours(d, h), 0);
}

export function snoozeOptions(now = new Date()) {
	const laterToday = startOfHour(new Date(now.getTime() + 3 * 3600_000));
	return [
		{ label: "Later today", date: laterToday },
		{ label: "Tomorrow morning", date: at(addDays(now, 1), 8) },
		{ label: "This weekend", date: at(addDays(now, (6 - now.getDay() + 7) % 7 || 7), 9) },
		{ label: "Next week", date: at(nextMonday(now), 8) },
	];
}

/** Pick a time to hide a thread until. */
export function SnoozeMenu({ onPick, trigger }: { onPick: (until: string) => void; trigger?: React.ReactNode }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				{trigger ?? (
					<button type="button" aria-label="Snooze" title="Snooze" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
						<Timer className="h-4 w-4" />
					</button>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="dark w-56 text-foreground">
				<DropdownMenuLabel>Snooze until</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{snoozeOptions().map((o) => (
					<DropdownMenuItem key={o.label} onSelect={() => onPick(o.date.toISOString())} className="flex justify-between gap-4">
						<span>{o.label}</span>
						<span className="text-xs text-muted-foreground">
							{o.date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
