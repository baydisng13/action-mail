import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTodo, fetchTodos, toggleTodo } from "../api";
import type { Todo } from "../types";

export const todoListQueryKey = ["todo-list"] as const;

export function useTodoList() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: todoListQueryKey,
		queryFn: fetchTodos,
	});

	const toggleMutation = useMutation({
		mutationFn: toggleTodo,
		onSuccess: (updated) => {
			queryClient.setQueryData<Todo[]>(todoListQueryKey, (current = []) =>
				current.map((todo) => (todo.id === updated.id ? updated : todo)),
			);
		},
	});

	const addMutation = useMutation({
		mutationFn: createTodo,
		onSuccess: (created) => {
			queryClient.setQueryData<Todo[]>(todoListQueryKey, (current = []) => [
				...current,
				created,
			]);
		},
	});

	return {
		todos: query.data ?? [],
		isPending: query.isPending,
		isError: query.isError,
		refetch: query.refetch,
		toggleTodo: toggleMutation.mutate,
		isToggling: toggleMutation.isPending,
		addTodo: addMutation.mutate,
		isAdding: addMutation.isPending,
	};
}
