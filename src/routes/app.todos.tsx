import { createFileRoute } from "@tanstack/react-router";
import {
	addDays,
	format,
	isToday,
	isTomorrow,
	startOfDay,
} from "date-fns";
import { Check, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MailboxSwitcher } from "@/features/mailbox/components/mailbox-switcher";
import {
	useCreateTodo,
	useDeleteTodo,
	useScanTodos,
	useToggleTodo,
	useTodos,
} from "@/features/todos/hooks";
import type { Bucket, TodoView } from "@/features/todos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/todos")({
	component: TodosPage,
});

const TABS: { key: Bucket; label: string }[] = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "This Week" },
	{ key: "someday", label: "Someday" },
];

function TodosPage() {
	const [tab, setTab] = useState<Bucket>("today");
	const [mailboxId, setMailboxId] = useState<string | null>(null);
	const todos = useTodos(mailboxId);
	const scan = useScanTodos();

	const buckets = useMemo(() => bucketize(todos.data ?? []), [todos.data]);
	const counts = {
		today: buckets.overdue.length + buckets.today.length,
		week: buckets.week.length,
		someday: buckets.someday.length,
	};

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto max-w-2xl px-6 py-10">
				<header className="mb-6 flex items-start justify-between gap-4">
					<div>
						<h1 className="font-display text-3xl tracking-tight">To-do</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							What actually needs you — from your inbox and your own list.
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<MailboxSwitcher value={mailboxId} onChange={setMailboxId} />
						<Button
							variant="outline"
							size="sm"
							disabled={scan.isPending}
							onClick={() => scan.mutate()}
						>
							{scan.isPending ? <Spinner className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
							Scan inbox
						</Button>
					</div>
				</header>

				<AddTodo />

				{/* Tabs */}
				<div className="mb-4 mt-6 flex items-center gap-1 border-b border-white/5">
					{TABS.map((t) => (
						<button
							key={t.key}
							type="button"
							onClick={() => setTab(t.key)}
							className={cn(
								"-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
								tab === t.key
									? "border-primary text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							{t.label}
							{counts[t.key] > 0 && (
								<span className="ml-1.5 text-xs text-muted-foreground">
									{counts[t.key]}
								</span>
							)}
						</button>
					))}
				</div>

				{todos.isLoading ? (
					<div className="flex justify-center py-16">
						<Spinner className="h-6 w-6" />
					</div>
				) : (
					<div className="space-y-6">
						{tab === "today" && (
							<>
								{buckets.overdue.length > 0 && (
									<Section title="Overdue" tone="danger" items={buckets.overdue} />
								)}
								<Section title="Today" items={buckets.today} empty="Nothing due today." />
								{buckets.done.length > 0 && (
									<Section title="Recently done" items={buckets.done} muted />
								)}
							</>
						)}
						{tab === "week" && (
							<Section
								title="Next 7 days"
								items={buckets.week}
								empty="Nothing scheduled this week."
							/>
						)}
						{tab === "someday" && (
							<Section
								title="No date"
								items={buckets.someday}
								empty="No undated tasks."
							/>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function AddTodo() {
	const [title, setTitle] = useState("");
	const [due, setDue] = useState("");
	const create = useCreateTodo();

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;
		create.mutate(
			{ title, dueAt: due ? new Date(due).toISOString() : null },
			{ onSuccess: () => { setTitle(""); setDue(""); } },
		);
	};

	return (
		<form
			onSubmit={submit}
			className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-2"
		>
			<Plus className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
			<Input
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				placeholder="Add a task…"
				className="h-9 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
			/>
			<input
				type="date"
				value={due}
				onChange={(e) => setDue(e.target.value)}
				className="h-9 rounded-md bg-white/5 px-2 text-sm text-muted-foreground [color-scheme:dark]"
			/>
			<Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
				Add
			</Button>
		</form>
	);
}

function Section({
	title,
	items,
	tone,
	muted,
	empty,
}: {
	title: string;
	items: TodoView[];
	tone?: "danger";
	muted?: boolean;
	empty?: string;
}) {
	if (items.length === 0 && !empty) return null;
	return (
		<div>
			<h2
				className={cn(
					"mb-2 text-xs font-medium uppercase tracking-wider",
					tone === "danger" ? "text-destructive" : "text-muted-foreground",
				)}
			>
				{title}
			</h2>
			{items.length === 0 ? (
				<p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
			) : (
				<ul className={cn("space-y-1.5", muted && "opacity-60")}>
					{items.map((t) => (
						<TodoRow key={t.id} todo={t} />
					))}
				</ul>
			)}
		</div>
	);
}

function TodoRow({ todo }: { todo: TodoView }) {
	const toggle = useToggleTodo();
	const del = useDeleteTodo();
	const done = todo.status === "done";

	return (
		<li className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-white/10">
			<button
				type="button"
				aria-label={done ? "Mark not done" : "Mark done"}
				onClick={() =>
					toggle.mutate({ id: todo.id, status: done ? "open" : "done" })
				}
				className={cn(
					"flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
					done
						? "border-primary bg-primary text-primary-foreground"
						: "border-white/25 hover:border-primary",
				)}
			>
				{done && <Check className="h-3 w-3" />}
			</button>

			<div className="min-w-0 flex-1">
				<div className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>
					{todo.title}
				</div>
				<div className="mt-0.5 flex items-center gap-2">
					{todo.dueAt && <DueChip iso={todo.dueAt} overdue={isOverdue(todo)} />}
					{todo.source === "ai" && (
						<span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary/80">
							<Sparkles className="h-3 w-3" />
							from mail
						</span>
					)}
				</div>
			</div>

			<button
				type="button"
				aria-label="Delete"
				onClick={() => del.mutate(todo.id)}
				className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-white/5 hover:text-destructive group-hover:opacity-100"
			>
				<Trash2 className="h-4 w-4" />
			</button>
		</li>
	);
}

function DueChip({ iso, overdue }: { iso: string; overdue: boolean }) {
	const d = new Date(iso);
	const label = isToday(d)
		? "Today"
		: isTomorrow(d)
			? "Tomorrow"
			: format(d, "MMM d");
	return (
		<span
			className={cn(
				"rounded px-1.5 py-0.5 text-[11px]",
				overdue ? "bg-destructive/15 text-destructive" : "bg-white/5 text-muted-foreground",
			)}
		>
			{label}
		</span>
	);
}

// ─── Bucketing ────────────────────────────────────────────────────────────────
function isOverdue(t: TodoView): boolean {
	return (
		t.status === "open" &&
		!!t.dueAt &&
		new Date(t.dueAt) < startOfDay(new Date())
	);
}

function bucketize(todos: TodoView[]) {
	const today0 = startOfDay(new Date());
	const tomorrow0 = addDays(today0, 1);
	const weekEnd = addDays(today0, 7);

	const overdue: TodoView[] = [];
	const today: TodoView[] = [];
	const week: TodoView[] = [];
	const someday: TodoView[] = [];
	const done: TodoView[] = [];

	for (const t of todos) {
		if (t.status === "done") {
			done.push(t);
			continue;
		}
		if (!t.dueAt) {
			someday.push(t);
			continue;
		}
		const d = new Date(t.dueAt);
		if (d < today0) overdue.push(t);
		else if (d < tomorrow0) today.push(t);
		if (d >= today0 && d < weekEnd) week.push(t);
	}
	return { overdue, today, week, someday, done };
}
