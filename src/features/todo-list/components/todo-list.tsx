import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useTodoList } from "../hooks/use-todo-list";

export function TodoList() {
	const [draft, setDraft] = useState("");
	const {
		todos,
		isPending,
		isError,
		refetch,
		toggleTodo,
		isToggling,
		addTodo,
		isAdding,
	} = useTodoList();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Todo list</CardTitle>
				<CardDescription>Mark items done or add new ones.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isPending && (
					<p className="text-sm text-muted-foreground">Loading todos…</p>
				)}
				{isError && (
					<div className="flex items-center gap-2">
						<p className="text-sm text-destructive">Failed to load todos.</p>
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							Retry
						</Button>
					</div>
				)}
				<ul className="space-y-2">
					{todos.map((todo) => (
						<li
							key={todo.id}
							className="flex items-center gap-3 rounded-md border px-3 py-2"
						>
							<Checkbox
								checked={todo.done}
								disabled={isToggling}
								onCheckedChange={() => toggleTodo(todo)}
							/>
							<span
								className={
									todo.done ? "text-muted-foreground line-through" : undefined
								}
							>
								{todo.title}
							</span>
						</li>
					))}
				</ul>
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						const title = draft.trim();
						if (!title) return;
						addTodo(title, {
							onSuccess: () => setDraft(""),
						});
					}}
				>
					<input
						className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						placeholder="New todo…"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
					/>
					<Button type="submit" disabled={isAdding}>
						Add
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
