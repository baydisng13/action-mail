import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImapConnectInput } from "@postscript/types";
import { mailboxApi } from "./api";

export const mailboxKeys = { list: ["mailboxes"] as const };

/** Connected mailboxes. Polls while any of them is still syncing. */
export function useMailboxes(options?: { enabled?: boolean }) {
	return useQuery({
		queryKey: mailboxKeys.list,
		queryFn: mailboxApi.list,
		enabled: options?.enabled ?? true,
		staleTime: 15_000,
		refetchInterval: (q) => (q.state.data?.some((m) => m.status === "pending" || m.status === "syncing") ? 4000 : false),
	});
}

export function useStartConnect() {
	return useMutation({
		mutationFn: () => mailboxApi.startConnect(),
		onSuccess: (url) => {
			window.location.href = url;
		},
	});
}

function useInvalidating<T>(fn: (v: T) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: mailboxKeys.list });
			qc.invalidateQueries({ queryKey: ["auth", "me"] });
			qc.invalidateQueries({ queryKey: ["mail"] });
		},
	});
}

export const useConnectImap = () => useInvalidating((input: ImapConnectInput) => mailboxApi.connectImap(input));
export const useDisconnect = () => useInvalidating((id: string) => mailboxApi.disconnect(id));
export const useSyncMailbox = () => useInvalidating((id: string) => mailboxApi.sync(id));
export const useUpdateMailbox = () =>
	useInvalidating((v: { id: string; displayName?: string | null; signatureHtml?: string | null }) => {
		const { id, ...rest } = v;
		return mailboxApi.update(id, rest);
	});
