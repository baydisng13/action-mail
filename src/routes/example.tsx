import { createFileRoute } from "@tanstack/react-router";
import { TodoList } from "@/features/todo-list";

export const Route = createFileRoute("/example")({
	component: ExamplePage,
});

function ExamplePage() {
	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">Todos</h1>
				<p className="text-sm text-muted-foreground">
					Your tasks in one place.
				</p>
			</div>
			<TodoList />
		</div>
	);
}
