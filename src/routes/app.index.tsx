import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { Inbox as InboxIcon, Mail } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ActionCard } from "@/features/inbox/components/action-card";
import { EmailBody } from "@/features/inbox/components/email-body";
import {
	useInbox,
	useThread,
	useThreadActions,
	useThreadSummary,
} from "@/features/inbox/hooks";
import { MailboxSwitcher } from "@/features/mailbox/components/mailbox-switcher";
import {
	type Category,
	CATEGORIES,
	CATEGORY_LABELS,
	type ThreadListItem,
} from "@/features/inbox/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
	component: InboxPage,
});

function InboxPage() {
	const [category, setCategory] = useState<Category>("primary");
	const [mailboxId, setMailboxId] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const inbox = useInbox(category, mailboxId);

	return (
		<div className="flex h-full flex-col">
			{/* Category tabs + mailbox switcher */}
			<div className="flex items-center gap-1 border-b border-white/5 px-4 py-3">
				<div className="flex flex-1 items-center gap-1 overflow-x-auto">
					{CATEGORIES.map((c) => (
					<button
						key={c}
						type="button"
						onClick={() => {
							setCategory(c);
							setSelected(null);
						}}
						className={cn(
							"whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors",
							category === c
								? "bg-primary/12 text-primary"
								: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
						)}
					>
						{CATEGORY_LABELS[c]}
					</button>
				))}
				</div>
				<MailboxSwitcher value={mailboxId} onChange={setMailboxId} />
			</div>

			<div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,380px)_1fr]">
				{/* Thread list */}
				<div
					className={cn(
						"min-h-0 overflow-y-auto border-r border-white/5",
						selected && "hidden lg:block",
					)}
				>
					{inbox.isLoading ? (
						<CenterSpinner />
					) : inbox.data && inbox.data.length > 0 ? (
						<ul>
							{inbox.data.map((t) => (
								<ThreadRow
									key={t.id}
									thread={t}
									active={t.id === selected}
									onClick={() => setSelected(t.id)}
								/>
							))}
						</ul>
					) : (
						<EmptyList />
					)}
				</div>

				{/* Reading pane */}
				<div className={cn("min-h-0 overflow-y-auto", !selected && "hidden lg:block")}>
					{selected ? (
						<ThreadView
							threadId={selected}
							onBack={() => setSelected(null)}
						/>
					) : (
						<ReadingEmpty />
					)}
				</div>
			</div>
		</div>
	);
}

function ThreadRow({
	thread,
	active,
	onClick,
}: {
	thread: ThreadListItem;
	active: boolean;
	onClick: () => void;
}) {
	const who = thread.fromName || thread.fromAddress || "Unknown";
	return (
		<li>
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]",
					active && "bg-primary/[0.06]",
				)}
			>
				<div className="flex items-center gap-2">
					{thread.unread && (
						<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
					)}
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-sm",
							thread.unread ? "font-semibold text-foreground" : "text-foreground/90",
						)}
					>
						{who}
					</span>
					<span className="shrink-0 text-xs text-muted-foreground">
						{thread.lastMessageAt
							? formatDistanceToNowStrict(new Date(thread.lastMessageAt), {
									addSuffix: false,
								})
							: ""}
					</span>
				</div>
				<div className="truncate text-sm text-foreground/80">
					{thread.subject || "(no subject)"}
					{thread.messageCount > 1 && (
						<span className="ml-1.5 text-xs text-muted-foreground">
							· {thread.messageCount}
						</span>
					)}
				</div>
				<div className="truncate text-xs text-muted-foreground">
					{thread.snippet}
				</div>
			</button>
		</li>
	);
}

function ThreadView({
	threadId,
	onBack,
}: {
	threadId: string;
	onBack: () => void;
}) {
	const [view, setView] = useState<"reader" | "original" | "summary">("reader");
	const thread = useThread(threadId);
	const actions = useThreadActions(threadId);
	const summary = useThreadSummary(threadId, view === "summary");

	if (thread.isLoading) return <CenterSpinner />;
	if (!thread.data) return <ReadingEmpty />;

	const summaryById = new Map(
		(summary.data ?? []).map((s) => [s.messageId, s.summary]),
	);

	return (
		<div className="mx-auto max-w-2xl px-6 py-8">
			<button
				type="button"
				onClick={onBack}
				className="mb-4 text-sm text-muted-foreground hover:text-foreground lg:hidden"
			>
				← Back
			</button>
			<h1 className="font-display text-2xl leading-tight tracking-tight">
				{thread.data.subject || "(no subject)"}
			</h1>

			{/* View switcher */}
			<div className="mt-4 inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-sm">
				{VIEWS.map((v) => (
					<button
						key={v.key}
						type="button"
						onClick={() => setView(v.key)}
						className={cn(
							"rounded-md px-3 py-1.5 transition-colors",
							view === v.key
								? "bg-primary/15 text-primary"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{v.label}
					</button>
				))}
			</div>

			{actions.data && actions.data.length > 0 && (
				<div className="mt-6 space-y-3">
					{actions.data.map((a) => (
						<ActionCard key={a.messageId} item={a} />
					))}
				</div>
			)}

			<div className="mt-6 space-y-6">
				{thread.data.messages.map((m) => (
					<article
						key={m.id}
						className="rounded-xl border border-white/5 bg-white/[0.02] p-5"
					>
						<div className="mb-3 flex items-baseline justify-between gap-3">
							<div className="min-w-0">
								<div className="truncate text-sm font-medium">
									{m.fromName || m.fromAddress || "Unknown"}
								</div>
								{m.fromName && m.fromAddress && (
									<div className="truncate text-xs text-muted-foreground">
										{m.fromAddress}
									</div>
								)}
							</div>
							<span className="shrink-0 text-xs text-muted-foreground">
								{m.internalDate
									? new Date(m.internalDate).toLocaleString()
									: ""}
							</span>
						</div>

						{view === "summary" ? (
							<SummaryBody
								loading={summary.isLoading}
								text={summaryById.get(m.id)}
							/>
						) : m.bodyHtml ? (
							<EmailBody html={m.bodyHtml} mode={view} />
						) : (
							<div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
								{m.bodyText?.trim() || m.snippet || "(no content)"}
							</div>
						)}
					</article>
				))}
			</div>
		</div>
	);
}

const VIEWS: { key: "reader" | "original" | "summary"; label: string }[] = [
	{ key: "reader", label: "Reader" },
	{ key: "original", label: "Original" },
	{ key: "summary", label: "AI summary" },
];

function SummaryBody({
	loading,
	text,
}: {
	loading: boolean;
	text: string | undefined;
}) {
	if (loading && !text) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Spinner className="h-4 w-4" />
				Summarising…
			</div>
		);
	}
	if (!text) {
		return (
			<p className="text-sm text-muted-foreground">No summary available.</p>
		);
	}
	return (
		<p className="text-sm leading-relaxed text-foreground/90">{text}</p>
	);
}

function ThreadPlaceholderIcon() {
	return (
		<div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
			<Mail className="h-6 w-6 text-muted-foreground" />
		</div>
	);
}

function ReadingEmpty() {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6 text-center">
			<ThreadPlaceholderIcon />
			<p className="font-display text-xl tracking-tight">Select a conversation</p>
			<p className="mt-1 text-sm text-muted-foreground">
				Pick a thread on the left to read it here.
			</p>
		</div>
	);
}

function EmptyList() {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
			<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
				<InboxIcon className="h-6 w-6 text-muted-foreground" />
			</div>
			<p className="font-medium">Nothing here yet</p>
			<p className="mt-1 text-sm text-muted-foreground">
				Messages appear as your inbox syncs.
			</p>
		</div>
	);
}

function CenterSpinner() {
	return (
		<div className="flex h-full items-center justify-center py-16">
			<Spinner className="h-6 w-6" />
		</div>
	);
}
