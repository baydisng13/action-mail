import type { Todo } from "./types";

const initialTodos: Todo[] = [
	{ id: "1", title: "Read CODE_STANDARDS.md", done: false },
	{ id: "2", title: "Add a feature under src/features/", done: false },
	{ id: "3", title: "Wire the feature into a route", done: true },
];

/** Replace with a real API call when you add a backend. */
export async function fetchTodos(): Promise<Todo[]> {
	await new Promise((resolve) => setTimeout(resolve, 400));
	return initialTodos;
}

export async function toggleTodo(todo: Todo): Promise<Todo> {
	await new Promise((resolve) => setTimeout(resolve, 200));
	return { ...todo, done: !todo.done };
}

export async function createTodo(title: string): Promise<Todo> {
	await new Promise((resolve) => setTimeout(resolve, 200));
	return {
		id: crypto.randomUUID(),
		title,
		done: false,
	};
}
