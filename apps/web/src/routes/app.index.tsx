import { type ThreadAction, type ThreadListItem, VIEWS } from "@postscript/types";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Inbox as InboxIcon, Keyboard, Paperclip, RefreshCw, Search, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Spinner } from "@/components/ui/spinner";
import { useMailboxes } from "@/features/mailbox/hooks";
import { useCompose } from "@/features/mail/compose/compose-context";
import { BulkBar } from "@/features/mail/components/bulk-bar";
import { ShortcutsDialog, useShortcuts } from "@/features/mail/components/shortcuts";
import { ThreadRow } from "@/features/mail/components/thread-list";
import { ThreadView } from "@/features/mail/components/thread-view";
import { mailApi, type SearchParams } from "@/features/mail/api";
import { useFolders, useThreadAction, useThreadList } from "@/features/mail/hooks";
import { viewLabel } from "@/features/mail/views";
import { getApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
	view: z.enum(VIEWS).optional().catch(undefined),
	mailbox: z.string().optional(),
	label: z.string().optional(),
	thread: z.string().optional(),
	q: z.string().optional(),
});

export const Route = createFileRoute("/app/")({
	validateSearch: searchSchema,
	component: MailPage,
});

const CATEGORIES = [
	["all", "All"],
	["primary", "Primary"],
	["promotions", "Promotions"],
	["social", "Social"],
	["updates", "Updates"],
] as const;

/** Undo for organize actions: the inverse of what was done. */
const INVERSE: Partial<Record<ThreadAction, ThreadAction>> = {
	archive: "inbox",
	trash: "restore",
	spam: "notSpam",
	inbox: "archive",
	snooze: "unsnooze",
};
const DONE: Partial<Record<ThreadAction, string>> = {
	archive: "Archived",
	trash: "Moved to Trash",
	spam: "Marked as spam",
	notSpam: "Moved to Inbox",
	inbox: "Moved to Inbox",
	restore: "Restored",
	delete: "Deleted forever",
	snooze: "Snoozed",
	move: "Moved",
};
/** Actions that take a thread out of the current list. */
const LEAVES = new Set<ThreadAction>(["archive", "trash", "spam", "notSpam", "restore", "delete", "move", "snooze", "inbox"]);

function parseQuery(raw: string): { q: string; from?: string } {
	let from: string | undefined;
	const q = raw
		.replace(/(?:^|\s)from:("([^"]+)"|(\S+))/i, (_m, _a, quoted, bare) => {
			from = quoted ?? bare;
			return " ";
		})
		.trim();
	return { q, from };
}

function MailPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/app/" });
	const view = search.view ?? "inbox";
	const compose = useCompose();
	const mailboxes = useMailboxes();
	const folders = useFolders(search.mailbox);
	const labelName = folders.data?.find((f) => f.id === search.label)?.name;

	const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>("all");
	const [unread, setUnread] = useState(false);
	const [starred, setStarred] = useState(false);
	const [attachments, setAttachments] = useState(false);
	const [queryText, setQueryText] = useState(search.q ?? "");
	const [checked, setChecked] = useState<Set<string>>(new Set());
	const [cursor, setCursor] = useState(0);
	const [help, setHelp] = useState(false);
	const lastChecked = useRef<number | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => setQueryText(search.q ?? ""), [search.q]);

	const searching: SearchParams | null = useMemo(() => {
		if (!search.q) return null;
		const p = parseQuery(search.q);
		return { ...p, mailboxId: search.mailbox, unread, starred, attachments };
	}, [search.q, search.mailbox, unread, starred, attachments]);

	const list = useThreadList(
		{ view, mailboxId: search.mailbox, labelId: search.label, category: view === "inbox" ? category : "all", unread, starred, attachments },
		searching,
	);
	const threads: ThreadListItem[] = useMemo(() => {
		const seen = new Set<string>();
		return (list.data?.pages ?? []).flatMap((p) => p.threads).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
	}, [list.data]);

	// Reset selection when the list context changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional resets
	useEffect(() => {
		setChecked(new Set());
		setCursor(0);
	}, [view, search.mailbox, search.label, search.q, category, unread, starred, attachments]);

	// Ask the worker to pull new mail every 60s while the inbox is open.
	useEffect(() => {
		const pull = () => mailApi.refresh().catch(() => undefined);
		pull();
		const t = setInterval(pull, 60_000);
		window.addEventListener("focus", pull);
		return () => {
			clearInterval(t);
			window.removeEventListener("focus", pull);
		};
	}, []);

	const act = useThreadAction();
	const openThread = useCallback(
		(id: string | undefined) => navigate({ search: (s) => ({ ...s, thread: id }), replace: Boolean(search.thread && id) }),
		[navigate, search.thread],
	);

	const runAction = useCallback(
		(action: ThreadAction, ids: string[], extra?: { folderId?: string; until?: string }, quiet = false) => {
			if (ids.length === 0) return;
			const open = search.thread;
			act.mutate(
				{ threadIds: ids, action, ...extra },
				{
					onSuccess: () => {
						const inverse = INVERSE[action];
						if (!quiet && DONE[action]) {
							toast(ids.length > 1 ? `${DONE[action]}: ${ids.length} conversations` : (DONE[action] as string), {
								action: inverse ? { label: "Undo", onClick: () => runAction(inverse, ids, undefined, true) } : undefined,
							});
						}
					},
					onError: (err) => toast.error(getApiError(err).message),
				},
			);
			if (LEAVES.has(action)) {
				setChecked(new Set());
				if (open && ids.includes(open)) {
					const idx = threads.findIndex((t) => t.id === open);
					const next = threads.slice(idx + 1).find((t) => !ids.includes(t.id));
					openThread(next?.id);
				}
			}
		},
		[act, search.thread, threads, openThread],
	);

	const toggleCheck = (i: number, shift: boolean) => {
		setChecked((prev) => {
			const next = new Set(prev);
			const id = threads[i].id;
			const on = !next.has(id);
			if (shift && lastChecked.current !== null) {
				const [a, b] = [Math.min(lastChecked.current, i), Math.max(lastChecked.current, i)];
				for (let k = a; k <= b; k++) {
					if (on) next.add(threads[k].id);
					else next.delete(threads[k].id);
				}
			} else if (on) next.add(id);
			else next.delete(id);
			lastChecked.current = i;
			return next;
		});
	};

	const targetIds = checked.size ? [...checked] : search.thread ? [search.thread] : threads[cursor] ? [threads[cursor].id] : [];
	const lastMessageOf = useCallback(async (threadId: string) => {
		const d = await mailApi.thread(threadId, false);
		return [...d.messages].reverse().find((m) => !m.isDraft)?.id;
	}, []);

	useShortcuts(
		useCallback(
			(key: string, e: KeyboardEvent) => {
				const n = threads.length;
				switch (key) {
					case "c":
						e.preventDefault();
						compose.open({ mode: "new", mailboxId: search.mailbox });
						break;
					case "/":
						e.preventDefault();
						searchRef.current?.focus();
						break;
					case "?":
						setHelp(true);
						break;
					case "j": {
						const i = Math.min(n - 1, (search.thread ? threads.findIndex((t) => t.id === search.thread) : cursor) + 1);
						setCursor(i);
						if (search.thread && threads[i]) openThread(threads[i].id);
						break;
					}
					case "k": {
						const i = Math.max(0, (search.thread ? threads.findIndex((t) => t.id === search.thread) : cursor) - 1);
						setCursor(i);
						if (search.thread && threads[i]) openThread(threads[i].id);
						break;
					}
					case "Enter":
					case "o":
						if (threads[cursor]) openThread(threads[cursor].id);
						break;
					case "u":
					case "Escape":
						if (search.thread) openThread(undefined);
						else setChecked(new Set());
						break;
					case "x":
						if (threads[cursor]) toggleCheck(cursor, false);
						break;
					case "e":
						runAction(view === "inbox" ? "archive" : "inbox", targetIds);
						break;
					case "#":
						runAction(view === "trash" ? "restore" : "trash", targetIds);
						break;
					case "s": {
						const t = threads.find((x) => x.id === targetIds[0]);
						if (t) runAction(t.starred ? "unstar" : "star", targetIds, undefined, true);
						break;
					}
					case "shift+i":
						runAction("read", targetIds, undefined, true);
						break;
					case "shift+u":
						runAction("unread", targetIds, undefined, true);
						break;
					case "r":
					case "a":
					case "f": {
						const id = search.thread;
						if (!id) break;
						const mode = key === "r" ? "reply" : key === "a" ? "replyAll" : "forward";
						lastMessageOf(id).then((sourceMessageId) => sourceMessageId && compose.open({ mode, sourceMessageId }));
						break;
					}
				}
			},
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[threads, cursor, search.thread, search.mailbox, view, targetIds.join(","), compose, openThread, runAction, lastMessageOf],
		),
	);

	const submitSearch = (e: React.FormEvent) => {
		e.preventDefault();
		const q = queryText.trim();
		navigate({ search: (s) => ({ ...s, q: q || undefined, thread: undefined }) });
	};

	const selectedMailbox = (() => {
		const ids = new Set(threads.filter((t) => checked.has(t.id)).map((t) => t.mailboxId));
		return ids.size === 1 ? [...ids][0] : search.mailbox;
	})();
	const showMailbox = !search.mailbox && (mailboxes.data?.length ?? 0) > 1;
	const title = search.q ? `Search: ${search.q}` : viewLabel(view, labelName);

	return (
		<div className="flex h-full flex-col">
			<ShortcutsDialog open={help} onOpenChange={setHelp} />
			<div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(340px,420px)_1fr]">
				{/* List column */}
				<div className={cn("flex min-h-0 flex-col lg:border-r lg:border-white/[0.06]", search.thread && "hidden lg:flex")}>
					<form onSubmit={submitSearch} className="flex items-center gap-2 px-3 pt-3">
						<div className="relative flex-1">
							<Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								ref={searchRef}
								data-testid="search-input"
								value={queryText}
								onChange={(e) => setQueryText(e.target.value)}
								onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), setQueryText(search.q ?? ""))}
								placeholder="Search mail (try from:anna invoice)"
								className="h-9 w-full rounded-lg bg-white/[0.05] pr-8 pl-9 text-sm outline-none placeholder:text-muted-foreground/70 focus:bg-white/[0.07]"
							/>
							{search.q && (
								<button
									type="button"
									aria-label="Clear search"
									onClick={() => navigate({ search: (s) => ({ ...s, q: undefined }) })}
									className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								>
									<X className="h-4 w-4" />
								</button>
							)}
						</div>
						<button type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelp(true)} className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground sm:flex">
							<Keyboard className="h-4 w-4" />
						</button>
					</form>

					<div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
						<h2 className="mr-1 shrink-0 text-sm font-medium" data-testid="view-title">{title}</h2>
						<Filter on={unread} onClick={() => setUnread((v) => !v)} label="Unread" testId="filter-unread" />
						<Filter on={starred} onClick={() => setStarred((v) => !v)} label="Starred" icon={<Star className="h-3 w-3" />} testId="filter-starred" />
						<Filter on={attachments} onClick={() => setAttachments((v) => !v)} label="Files" icon={<Paperclip className="h-3 w-3" />} testId="filter-attachments" />
						<button type="button" aria-label="Refresh" title="Refresh" onClick={() => { mailApi.refresh().catch(() => undefined); list.refetch(); }} className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
							<RefreshCw className={cn("h-3.5 w-3.5", list.isFetching && "animate-spin")} />
						</button>
					</div>

					{view === "inbox" && !search.q && (
						<div className="flex gap-1 overflow-x-auto px-3 pb-2">
							{CATEGORIES.map(([c, label]) => (
								<button
									key={c}
									type="button"
									onClick={() => setCategory(c)}
									className={cn("shrink-0 rounded-full px-3 py-1 text-xs transition-colors", category === c ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground")}
								>
									{label}
								</button>
							))}
						</div>
					)}

					{checked.size > 0 && (
						<BulkBar
							count={checked.size}
							view={view}
							mailboxId={selectedMailbox}
							onAction={(a, extra) => runAction(a, [...checked], extra)}
							onClear={() => setChecked(new Set())}
						/>
					)}

					<div className="min-h-0 flex-1 overflow-y-auto" data-testid="thread-list">
						{list.isLoading ? (
							<div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
						) : list.isError ? (
							<div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-sm">
								<p className="text-muted-foreground">{getApiError(list.error).message}</p>
								<button type="button" className="underline" onClick={() => list.refetch()}>Try again</button>
							</div>
						) : threads.length === 0 ? (
							<EmptyList searching={Boolean(search.q)} view={title} />
						) : (
							<ul className="divide-y divide-white/[0.04]">
								{threads.map((t, i) => (
									<ThreadRow
										key={t.id}
										thread={t}
										active={t.id === search.thread}
										focused={!search.thread && i === cursor}
										checked={checked.has(t.id)}
										showMailbox={showMailbox}
										onOpen={() => {
											setCursor(i);
											openThread(t.id);
										}}
										onCheck={(shift) => toggleCheck(i, shift)}
										onStar={() => runAction(t.starred ? "unstar" : "star", [t.id], undefined, true)}
									/>
								))}
							</ul>
						)}
						{list.hasNextPage && (
							<div className="flex justify-center py-4">
								<button type="button" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
									{list.isFetchingNextPage ? "Loading" : "Load more"}
								</button>
							</div>
						)}
					</div>
				</div>

				{/* Reading pane */}
				<div className={cn("min-h-0", !search.thread && "hidden lg:block")}>
					{search.thread ? (
						<ThreadView
							key={search.thread}
							threadId={search.thread}
							onBack={() => openThread(undefined)}
							onAction={(a, extra) => runAction(a, [search.thread as string], extra)}
						/>
					) : (
						<div className="flex h-full flex-col items-center justify-center px-6 text-center">
							<p className="font-display text-xl tracking-tight">Select a conversation</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Press <kbd className="rounded bg-white/[0.08] px-1 font-mono text-xs">c</kbd> to write, <kbd className="rounded bg-white/[0.08] px-1 font-mono text-xs">?</kbd> for shortcuts.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function Filter({ on, onClick, label, icon, testId }: { on: boolean; onClick: () => void; label: string; icon?: React.ReactNode; testId: string }) {
	return (
		<button
			type="button"
			data-testid={testId}
			aria-pressed={on}
			onClick={onClick}
			className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors", on ? "bg-primary/15 text-primary" : "bg-white/[0.04] text-muted-foreground hover:text-foreground")}
		>
			{icon}
			{label}
		</button>
	);
}

function EmptyList({ searching, view }: { searching: boolean; view: string }) {
	return (
		<div className="flex flex-col items-center justify-center px-6 py-20 text-center" data-testid="empty-list">
			<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05]">
				<InboxIcon className="h-6 w-6 text-muted-foreground" />
			</div>
			<p className="font-medium">{searching ? "No results" : `Nothing in ${view}`}</p>
			<p className="mt-1 max-w-xs text-sm text-muted-foreground">
				{searching ? "Search runs on your mail provider. Try fewer words, or a from: filter." : "New mail shows up here on its own. Syncing can take a minute after you connect."}
			</p>
		</div>
	);
}
