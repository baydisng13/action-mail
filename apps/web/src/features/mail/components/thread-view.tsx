import type { Address, MessageView, ThreadAction, ThreadDetail } from "@postscript/types";
import { format } from "date-fns";
import {
	Archive,
	ArrowLeft,
	Download,
	FileEdit,
	Forward,
	ImageOff,
	Inbox,
	Mail,
	Paperclip,
	Reply,
	ReplyAll,
	RotateCcw,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
	Star,
	Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useConfig } from "@/features/auth/hooks";
import { getApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useCompose } from "../compose/compose-context";
import { useAiActions, useAiSummary, useThread } from "../hooks";
import { ActionCard } from "./action-card";
import { EmailBody } from "./email-body";
import { MoveMenu } from "./move-menu";
import { SnoozeMenu } from "./snooze-menu";

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const who = (a: Address | null) => (a ? a.name || a.address : "Unknown");
const list = (xs: Address[]) => xs.map((a) => a.name || a.address).join(", ");

function ToolBtn({ label, onClick, children, testId }: { label: string; onClick: () => void; children: React.ReactNode; testId?: string }) {
	return (
		<button type="button" aria-label={label} title={label} data-testid={testId} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
			{children}
		</button>
	);
}

export function ThreadView({
	threadId,
	onBack,
	onAction,
}: {
	threadId: string;
	onBack: () => void;
	onAction: (a: ThreadAction, extra?: { folderId?: string; until?: string }) => void;
}) {
	const [images, setImages] = useState(false);
	const [mode, setMode] = useState<"reader" | "original" | "summary">("original");
	const thread = useThread(threadId, images);
	const config = useConfig();
	const ai = Boolean(config.data?.features.ai);
	const actions = useAiActions(threadId, ai);
	const summary = useAiSummary(threadId, ai && mode === "summary");
	const compose = useCompose();
	const qc = useQueryClient();
	const loadedId = thread.data?.id;

	// Opening marks the thread read on the server: refresh list badges.
	useEffect(() => {
		if (!loadedId) return;
		qc.invalidateQueries({ queryKey: ["mail", "list"] });
		qc.invalidateQueries({ queryKey: ["mail", "folders"] });
	}, [loadedId, qc]);

	if (thread.isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner className="h-6 w-6" />
			</div>
		);
	}
	if (thread.isError || !thread.data) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
				<p className="text-sm text-muted-foreground">{getApiError(thread.error).message || "Could not open this conversation."}</p>
				<button type="button" className="text-sm underline" onClick={() => thread.refetch()}>Try again</button>
			</div>
		);
	}

	const t: ThreadDetail = thread.data;
	const inTrash = t.roles.includes("trash");
	const inSpam = t.roles.includes("spam");
	const inInbox = t.roles.includes("inbox");
	const last = [...t.messages].reverse().find((m) => !m.isDraft) ?? t.messages[t.messages.length - 1];
	const blocked = !images && t.messages.some((m) => m.hasRemoteImages);
	const summaryById = new Map((summary.data ?? []).map((s) => [s.messageId, s.summary]));

	return (
		<div className="flex h-full flex-col" data-testid="thread-view">
			<div className="flex items-center gap-0.5 px-3 py-1.5">
				<ToolBtn label="Back to list" onClick={onBack} testId="thread-back"><ArrowLeft className="h-4 w-4" /></ToolBtn>
				<span className="mx-1 h-4 w-px bg-white/10" />
				{inTrash ? (
					<ToolBtn label="Restore" onClick={() => onAction("restore")} testId="thread-restore"><RotateCcw className="h-4 w-4" /></ToolBtn>
				) : inInbox ? (
					<ToolBtn label="Archive (e)" onClick={() => onAction("archive")} testId="thread-archive"><Archive className="h-4 w-4" /></ToolBtn>
				) : (
					<ToolBtn label="Move to Inbox" onClick={() => onAction("inbox")} testId="thread-inbox"><Inbox className="h-4 w-4" /></ToolBtn>
				)}
				{inTrash ? (
					t.provider === "imap" && <ToolBtn label="Delete forever" onClick={() => onAction("delete")} testId="thread-delete"><Trash2 className="h-4 w-4 text-destructive" /></ToolBtn>
				) : (
					<ToolBtn label="Delete (#)" onClick={() => onAction("trash")} testId="thread-trash"><Trash2 className="h-4 w-4" /></ToolBtn>
				)}
				{inSpam ? (
					<ToolBtn label="Not spam" onClick={() => onAction("notSpam")}><ShieldCheck className="h-4 w-4" /></ToolBtn>
				) : (
					!inTrash && <ToolBtn label="Report spam" onClick={() => onAction("spam")}><ShieldAlert className="h-4 w-4" /></ToolBtn>
				)}
				<ToolBtn label="Mark as unread" onClick={() => onAction("unread")} testId="thread-unread"><Mail className="h-4 w-4" /></ToolBtn>
				<SnoozeMenu onPick={(until) => onAction("snooze", { until })} />
				<MoveMenu mailboxId={t.mailboxId} onPick={(f) => onAction("move", { folderId: f.id })} />
				<button
					type="button"
					aria-label={t.starred ? "Unstar (s)" : "Star (s)"}
					title={t.starred ? "Unstar" : "Star"}
					data-testid="thread-star"
					onClick={() => onAction(t.starred ? "unstar" : "star")}
					className={cn("flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/[0.06]", t.starred ? "text-amber-300" : "text-muted-foreground hover:text-foreground")}
				>
					<Star className={cn("h-4 w-4", t.starred && "fill-current")} />
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto max-w-3xl px-4 pt-4 pb-16 sm:px-6">
					<h1 className="font-display text-2xl leading-tight tracking-tight" data-testid="thread-title">
						{t.subject || "(no subject)"}
					</h1>
					<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<span>{t.mailboxEmail}</span>
						{t.snoozedUntil && <span className="text-amber-300/80">Snoozed until {format(new Date(t.snoozedUntil), "MMM d, h:mm a")}</span>}
					</div>

					<div className="mt-4 inline-flex rounded-lg bg-white/[0.04] p-0.5 text-sm">
						{(["original", "reader", "summary"] as const).map((v) => (
							<button
								key={v}
								type="button"
								onClick={() => setMode(v)}
								className={cn("rounded-md px-3 py-1.5 transition-colors", mode === v ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}
							>
								{v === "original" ? "Original" : v === "reader" ? "Reader" : (
									<span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" />Summary</span>
								)}
							</button>
						))}
					</div>

					{ai && actions.data && actions.data.length > 0 && (
						<div className="mt-5 space-y-3">
							{actions.data.map((a) => <ActionCard key={a.messageId} item={a} />)}
						</div>
					)}

					{blocked && (
						<div className="mt-5 flex items-center gap-3 rounded-lg bg-white/[0.04] px-4 py-2.5 text-sm">
							<ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
							<span className="flex-1 text-muted-foreground">Images are hidden to protect your privacy.</span>
							<button type="button" className="font-medium hover:underline" data-testid="show-images" onClick={() => setImages(true)}>
								Show images
							</button>
						</div>
					)}

					<div className="mt-5 space-y-3">
						{t.messages.map((m) => (
							<MessageCard
								key={m.id}
								m={m}
								defaultOpen={m.id === last?.id || m.unread || m.isDraft || t.messages.length <= 2}
								mode={mode}
								ai={ai}
								summary={summaryById.get(m.id)}
								summaryLoading={summary.isLoading}
								summaryError={summary.isError ? getApiError(summary.error).message : null}
								onReply={(mode) => compose.open({ mode, sourceMessageId: m.id })}
							/>
						))}
					</div>

					{last && !last.isDraft && (
						<div className="mt-6 flex flex-wrap gap-2">
							<ReplyButton label="Reply" testId="reply" onClick={() => compose.open({ mode: "reply", sourceMessageId: last.id })} icon={<Reply className="h-4 w-4" />} />
							<ReplyButton label="Reply all" testId="reply-all" onClick={() => compose.open({ mode: "replyAll", sourceMessageId: last.id })} icon={<ReplyAll className="h-4 w-4" />} />
							<ReplyButton label="Forward" testId="forward" onClick={() => compose.open({ mode: "forward", sourceMessageId: last.id })} icon={<Forward className="h-4 w-4" />} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function ReplyButton({ label, onClick, icon, testId }: { label: string; onClick: () => void; icon: React.ReactNode; testId: string }) {
	return (
		<button type="button" data-testid={testId} onClick={onClick} className="inline-flex items-center gap-2 rounded-lg bg-white/[0.05] px-4 py-2 text-sm hover:bg-white/[0.09]">
			{icon}
			{label}
		</button>
	);
}

function MessageCard({
	m,
	defaultOpen,
	mode,
	ai,
	summary,
	summaryLoading,
	summaryError,
	onReply,
}: {
	m: MessageView;
	defaultOpen: boolean;
	mode: "reader" | "original" | "summary";
	ai: boolean;
	summary?: string;
	summaryLoading: boolean;
	summaryError: string | null;
	onReply: (mode: "reply" | "replyAll" | "forward" | "edit") => void;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const files = m.attachments.filter((a) => !a.inline || !m.html);
	return (
		<article className="rounded-xl bg-white/[0.025]" data-testid="message">
			<button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
					{who(m.from).slice(0, 1).toUpperCase()}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline gap-2">
						<span className="truncate text-sm font-medium">{who(m.from)}</span>
						{m.from?.name && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{m.from.address}</span>}
						{m.isDraft && <span className="text-xs text-destructive">Draft</span>}
						<span className="ml-auto shrink-0 text-xs text-muted-foreground">{m.date ? format(new Date(m.date), "MMM d, h:mm a") : ""}</span>
					</div>
					{open ? (
						<div className="truncate text-xs text-muted-foreground">
							to {list(m.to) || "undisclosed recipients"}
							{m.cc.length > 0 && `, cc ${list(m.cc)}`}
							{m.bcc.length > 0 && `, bcc ${list(m.bcc)}`}
						</div>
					) : (
						<div className="truncate text-xs text-muted-foreground">{(m.text ?? "").slice(0, 160)}</div>
					)}
				</div>
			</button>
			{open && (
				<div className="px-4 pb-4">
					{m.isDraft ? (
						<button type="button" onClick={() => onReply("edit")} className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-sm hover:bg-white/[0.1]" data-testid="edit-draft">
							<FileEdit className="h-4 w-4" /> Edit draft
						</button>
					) : null}
					{mode === "summary" ? (
						!ai ? (
							<p className="text-sm text-muted-foreground">AI is not set up on this server yet.</p>
						) : summaryError ? (
							<p className="text-sm text-muted-foreground">{summaryError}</p>
						) : summary ? (
							<p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
						) : summaryLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="h-4 w-4" />Summarising</div>
						) : (
							<p className="text-sm text-muted-foreground">No summary for this message.</p>
						)
					) : m.unavailable ? (
						<p className="text-sm text-muted-foreground">This message could not be loaded from your provider right now. It may have been moved or deleted.</p>
					) : m.html ? (
						<EmailBody html={m.html} mode={mode} />
					) : (
						<div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85" data-testid="message-text">
							{m.text?.trim() || "(no content)"}
						</div>
					)}
					{files.length > 0 && (
						<div className="mt-4 flex flex-wrap gap-2" data-testid="attachments">
							{files.map((a) => (
								<a
									key={a.id}
									href={a.url}
									target="_blank"
									rel="noopener noreferrer"
									download={a.filename}
									className="inline-flex max-w-full items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2 text-sm hover:bg-white/[0.09]"
								>
									<Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
									<span className="truncate">{a.filename}</span>
									<span className="shrink-0 text-xs text-muted-foreground">{fmtSize(a.size)}</span>
									<Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
								</a>
							))}
						</div>
					)}
					{!m.isDraft && (
						<div className="mt-3 flex gap-1">
							<ToolBtn label="Reply" onClick={() => onReply("reply")}><Reply className="h-4 w-4" /></ToolBtn>
							<ToolBtn label="Reply all" onClick={() => onReply("replyAll")}><ReplyAll className="h-4 w-4" /></ToolBtn>
							<ToolBtn label="Forward" onClick={() => onReply("forward")}><Forward className="h-4 w-4" /></ToolBtn>
						</div>
					)}
				</div>
			)}
		</article>
	);
}
