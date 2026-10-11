import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { todosApi } from "./api";

const KEY = ["todos"] as const;

export function useTodos(mailboxId?: string | null, enabled = true) {
	return useQuery({
		queryKey: [...KEY, mailboxId ?? "all"],
		queryFn: () => todosApi.list(mailboxId),
		enabled,
		staleTime: 15_000,
	});
}

function useTodoMutation<TArgs>(fn: (a: TArgs) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}

export function useCreateTodo() {
	return useTodoMutation((input: Parameters<typeof todosApi.create>[0]) =>
		todosApi.create(input),
	);
}

export function useToggleTodo() {
	return useTodoMutation((v: { id: string; status: "open" | "done" }) =>
		todosApi.patch(v.id, { status: v.status }),
	);
}

export function useUpdateTodo() {
	return useTodoMutation(
		(v: { id: string } & Parameters<typeof todosApi.patch>[1]) => {
			const { id, ...rest } = v;
			return todosApi.patch(id, rest);
		},
	);
}

export function useDeleteTodo() {
	return useTodoMutation((id: string) => todosApi.remove(id));
}

export function useScanTodos() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => todosApi.scan(),
		onSuccess: (r) => {
			qc.invalidateQueries({ queryKey: KEY });
			toast.success(
				r.created > 0
					? `Found ${r.created} task${r.created === 1 ? "" : "s"} in your inbox`
					: "No new tasks found",
			);
		},
	});
}
