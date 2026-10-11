import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ThreadActionInput, ThreadDetail, ThreadListResponse, ThreadsQuery } from "@postscript/types";
import { mailApi, type SearchParams } from "./api";

export const mailKeys = {
	all: ["mail"] as const,
	folders: (mailboxId?: string) => ["mail", "folders", mailboxId ?? "all"] as const,
	list: (key: unknown) => ["mail", "list", key] as const,
	thread: (id: string, images: boolean) => ["mail", "thread", id, images] as const,
	aiActions: (id: string) => ["mail", "ai", "actions", id] as const,
	aiSummary: (id: string) => ["mail", "ai", "summary", id] as const,
};

const PAGE = 50;

export function useFolders(mailboxId?: string) {
	return useQuery({
		queryKey: mailKeys.folders(mailboxId),
		queryFn: () => mailApi.folders(mailboxId),
		refetchInterval: 30_000,
		staleTime: 10_000,
	});
}

/** Thread list (or provider search results when `search` is set). Polls every 30s. */
export function useThreadList(query: Omit<ThreadsQuery, "offset" | "limit">, search: SearchParams | null) {
	return useInfiniteQuery({
		queryKey: mailKeys.list(search ? { search } : query),
		initialPageParam: 0,
		queryFn: async ({ pageParam }): Promise<ThreadListResponse> =>
			search ? mailApi.search(search) : mailApi.threads({ ...query, offset: pageParam, limit: PAGE }),
		getNextPageParam: (last, pages) => (!search && last.hasMore ? pages.length * PAGE : undefined),
		refetchInterval: search ? false : 30_000,
		placeholderData: keepPreviousData,
		staleTime: 5_000,
	});
}

export function useThread(id: string | null, images: boolean) {
	return useQuery({
		queryKey: mailKeys.thread(id ?? "none", images),
		queryFn: () => mailApi.thread(id as string, images),
		enabled: Boolean(id),
		staleTime: 60_000,
	});
}

export function useAiActions(id: string | null, enabled: boolean) {
	return useQuery({
		queryKey: mailKeys.aiActions(id ?? "none"),
		queryFn: () => mailApi.aiActions(id as string),
		enabled: Boolean(id) && enabled,
		staleTime: 10 * 60_000,
		retry: false,
	});
}

export function useAiSummary(id: string | null, enabled: boolean) {
	return useQuery({
		queryKey: mailKeys.aiSummary(id ?? "none"),
		queryFn: () => mailApi.aiSummary(id as string),
		enabled: Boolean(id) && enabled,
		staleTime: 10 * 60_000,
		retry: false,
	});
}

/** Organize threads. Optimistically patches open thread detail flags, then refetches. */
export function useThreadAction() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: ThreadActionInput) => mailApi.act(input),
		onMutate: (input) => {
			const patch: Partial<ThreadDetail> | null =
				input.action === "read" ? { unread: false } :
				input.action === "unread" ? { unread: true } :
				input.action === "star" ? { starred: true } :
				input.action === "unstar" ? { starred: false } : null;
			if (!patch) return;
			for (const id of input.threadIds) {
				for (const images of [true, false]) {
					qc.setQueryData<ThreadDetail>(mailKeys.thread(id, images), (old) => (old ? { ...old, ...patch } : old));
				}
			}
		},
		onSettled: () => qc.invalidateQueries({ queryKey: mailKeys.all }),
	});
}
