import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mailboxApi } from "./api";

export const mailboxKeys = {
	list: ["mailboxes"] as const,
	status: (id: string) => ["mailbox", id, "status"] as const,
};

export function useMailboxes(options?: { enabled?: boolean }) {
	return useQuery({
		queryKey: mailboxKeys.list,
		queryFn: mailboxApi.list,
		enabled: options?.enabled ?? true,
		staleTime: 30_000,
		retry: false,
	});
}

/** Live sync status. Polls while a backfill is in progress, stops when ready. */
export function useMailboxStatus(id: string | undefined, enabled: boolean) {
	return useQuery({
		queryKey: id ? mailboxKeys.status(id) : ["mailbox", "none"],
		queryFn: () => mailboxApi.status(id as string),
		enabled: enabled && Boolean(id),
		retry: false,
		refetchInterval: (query) => {
			const s = query.state.data?.status;
			return s === "ready" || s === "error" ? false : 2000;
		},
	});
}

/** Kick off the Gmail connect flow, then navigate to Google. */
export function useStartConnect() {
	return useMutation({
		mutationFn: () => mailboxApi.startConnect(),
		onSuccess: (url) => {
			window.location.href = url;
		},
	});
}

export function useStartSync() {
	return useMutation({ mutationFn: (id: string) => mailboxApi.startSync(id) });
}

export function useRefreshMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => mailboxApi.refresh(id),
		onSuccess: (_res, id) => {
			qc.invalidateQueries({ queryKey: mailboxKeys.status(id) });
		},
	});
}

export function useDisconnect() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => mailboxApi.disconnect(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: mailboxKeys.list }),
	});
}
