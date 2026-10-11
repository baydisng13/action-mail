import type { ThreadAction, View } from "@postscript/types";
import { Archive, Inbox, Mail, MailOpen, RotateCcw, ShieldAlert, ShieldCheck, Star, Trash2, X } from "lucide-react";
import { MoveMenu } from "./move-menu";
import { SnoozeMenu } from "./snooze-menu";

function Btn({ label, onClick, children, testId }: { label: string; onClick: () => void; children: React.ReactNode; testId?: string }) {
	return (
		<button type="button" aria-label={label} title={label} data-testid={testId} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
			{children}
		</button>
	);
}

/** Actions for the checked threads. */
export function BulkBar({
	count,
	view,
	mailboxId,
	onAction,
	onClear,
}: {
	count: number;
	view: View;
	mailboxId?: string;
	onAction: (a: ThreadAction, extra?: { folderId?: string; until?: string }) => void;
	onClear: () => void;
}) {
	return (
		<div className="flex items-center gap-1 bg-primary/[0.06] px-3 py-1.5" data-testid="bulk-bar">
			<button type="button" aria-label="Clear selection" onClick={onClear} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
				<X className="h-4 w-4" />
			</button>
			<span className="mr-auto text-sm">{count} selected</span>
			{view === "trash" ? (
				<Btn label="Restore" onClick={() => onAction("restore")} testId="bulk-restore"><RotateCcw className="h-4 w-4" /></Btn>
			) : view === "spam" ? (
				<Btn label="Not spam" onClick={() => onAction("notSpam")}><ShieldCheck className="h-4 w-4" /></Btn>
			) : view === "inbox" ? (
				<Btn label="Archive" onClick={() => onAction("archive")} testId="bulk-archive"><Archive className="h-4 w-4" /></Btn>
			) : (
				<Btn label="Move to Inbox" onClick={() => onAction("inbox")}><Inbox className="h-4 w-4" /></Btn>
			)}
			{view !== "trash" && <Btn label="Delete" onClick={() => onAction("trash")} testId="bulk-trash"><Trash2 className="h-4 w-4" /></Btn>}
			{view !== "spam" && view !== "trash" && <Btn label="Report spam" onClick={() => onAction("spam")}><ShieldAlert className="h-4 w-4" /></Btn>}
			<Btn label="Mark as read" onClick={() => onAction("read")} testId="bulk-read"><MailOpen className="h-4 w-4" /></Btn>
			<Btn label="Mark as unread" onClick={() => onAction("unread")} testId="bulk-unread"><Mail className="h-4 w-4" /></Btn>
			<Btn label="Star" onClick={() => onAction("star")}><Star className="h-4 w-4" /></Btn>
			<SnoozeMenu onPick={(until) => onAction("snooze", { until })} />
			<MoveMenu mailboxId={mailboxId} onPick={(f) => onAction("move", { folderId: f.id })} />
		</div>
	);
}
