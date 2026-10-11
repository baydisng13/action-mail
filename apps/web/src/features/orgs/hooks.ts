import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orgsApi } from "./api";

export const orgKeys = { members: ["org", "members"] as const };

/**
 * Switching workspace changes every tenant-scoped query: drop their cache, but
 * keep the current user loaded (refetching in place) so the shell stays mounted
 * and per-call callbacks such as navigation still run.
 */
function resetTenantCache(qc: ReturnType<typeof useQueryClient>) {
	qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
	return qc.invalidateQueries({ queryKey: ["auth"] });
}

export function useSwitchOrg() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => orgsApi.switchTo(id),
		onSuccess: () => resetTenantCache(qc),
	});
}

export function useCreateOrg() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (name: string) => orgsApi.create(name),
		onSuccess: () => resetTenantCache(qc),
	});
}

export function useMembers(enabled = true) {
	return useQuery({ queryKey: orgKeys.members, queryFn: orgsApi.members, enabled });
}

export function useOrgMutation<T>(fn: (v: T) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: orgKeys.members });
			qc.invalidateQueries({ queryKey: ["auth", "me"] });
		},
	});
}
