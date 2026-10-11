import type { ThreadListItem } from "@postscript/types";
import { format, isThisYear, isToday } from "date-fns";
import { FileEdit, Paperclip, Star, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

export function shortDate(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (isToday(d)) return format(d, "h:mm a");
	if (isThisYear(d)) return format(d, "MMM d");
	return format(d, "d/M/yy");
}

export function ThreadRow({
	thread,
	active,
	focused,
	checked,
	showMailbox,
	onOpen,
	onCheck,
	onStar,
}: {
	thread: ThreadListItem;
	active: boolean;
	focused: boolean;
	checked: boolean;
	showMailbox: boolean;
	onOpen: () => void;
	onCheck: (shift: boolean) => void;
	onStar: () => void;
}) {
	const who =
		thread.roles.includes("sent") && thread.participants.length
			? `To: ${thread.participants.join(", ")}`
			: thread.participants.length
				? thread.participants.join(", ")
				: thread.from?.name || thread.from?.address || "Unknown sender";
	return (
		<li
			data-testid="thread-row"
			data-thread-id={thread.id}
			data-unread={thread.unread ? "true" : "false"}
			className={cn(
				"group relative flex cursor-pointer items-start gap-2 px-3 py-2.5 transition-colors hover:bg-white/[0.03]",
				active && "bg-primary/[0.07]",
				checked && "bg-primary/[0.05]",
			)}
			onClick={onOpen}
			onKeyDown={(e) => e.key === "Enter" && onOpen()}
		>
			{focused && <span className="absolute inset-y-1 left-0 w-0.5 rounded bg-primary" />}
			<div className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
				<input
					type="checkbox"
					aria-label="Select conversation"
					data-testid="thread-check"
					checked={checked}
					onClick={(e) => {
						e.stopPropagation();
						onCheck(e.shiftKey);
					}}
					onChange={() => {}}
					className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
				/>
				<button
					type="button"
					aria-label={thread.starred ? "Unstar" : "Star"}
					onClick={(e) => {
						e.stopPropagation();
						onStar();
					}}
					className={cn("text-muted-foreground/50 hover:text-amber-300", thread.starred && "text-amber-300")}
				>
					<Star className={cn("h-3.5 w-3.5", thread.starred && "fill-current")} />
				</button>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					{thread.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
					<span className={cn("min-w-0 flex-1 truncate text-sm", thread.unread ? "font-semibold text-foreground" : "text-foreground/85")}>
						{who}
						{thread.messageCount > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground">{thread.messageCount}</span>}
					</span>
					{thread.hasAttachments && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" />}
					<span className={cn("shrink-0 text-xs", thread.unread ? "text-foreground" : "text-muted-foreground")}>{shortDate(thread.lastMessageAt)}</span>
				</div>
				<div className={cn("truncate text-sm", thread.unread ? "text-foreground" : "text-foreground/75")} data-testid="thread-subject">
					{thread.hasDraft && <span className="mr-1.5 text-xs text-destructive"><FileEdit className="mr-0.5 inline h-3 w-3" />Draft</span>}
					{thread.subject || "(no subject)"}
				</div>
				<div className="flex items-center gap-2">
					<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{thread.snippet}</span>
					{thread.snoozedUntil && (
						<span className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-300/80">
							<Timer className="h-3 w-3" />
							{shortDate(thread.snoozedUntil)}
						</span>
					)}
					{showMailbox && <span className="hidden max-w-[9rem] shrink-0 truncate text-[11px] text-muted-foreground/70 sm:inline">{thread.mailboxEmail}</span>}
				</div>
			</div>
		</li>
	);
}
