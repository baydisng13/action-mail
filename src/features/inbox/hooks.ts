import { useQuery } from "@tanstack/react-query";
import { inboxApi } from "./api";
import type { Category } from "./types";

export const inboxKeys = {
	list: (category: Category, mailboxId?: string | null) =>
		["inbox", category, mailboxId ?? "all"] as const,
	thread: (id: string) => ["thread", id] as const,
	actions: (id: string) => ["thread", id, "actions"] as const,
};

export function useInbox(
	category: Category,
	mailboxId?: string | null,
	enabled = true,
) {
	return useQuery({
		queryKey: inboxKeys.list(category, mailboxId),
		queryFn: () => inboxApi.list(category, mailboxId),
		enabled,
		staleTime: 10_000,
	});
}

export function useThread(id: string | undefined) {
	return useQuery({
		queryKey: inboxKeys.thread(id ?? "none"),
		queryFn: () => inboxApi.thread(id as string),
		enabled: Boolean(id),
	});
}

/** Runs (server-cached) action extraction when a thread is opened. */
export function useThreadActions(id: string | undefined) {
	return useQuery({
		queryKey: inboxKeys.actions(id ?? "none"),
		queryFn: () => inboxApi.actions(id as string),
		enabled: Boolean(id),
		staleTime: 5 * 60_000,
		retry: false,
	});
}

/** AI summary — fetched lazily, only when the Summary view is opened. */
export function useThreadSummary(id: string | undefined, enabled: boolean) {
	return useQuery({
		queryKey: ["thread", id ?? "none", "summary"],
		queryFn: () => inboxApi.summary(id as string),
		enabled: Boolean(id) && enabled,
		staleTime: 5 * 60_000,
		retry: false,
	});
}
