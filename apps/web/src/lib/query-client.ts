import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { getApiError } from "./api-client";
import { emitUpgrade, isUpgradeCode } from "./upgrade-bus";

function handleLimit(err: unknown) {
	const e = getApiError(err);
	if (e.status === 402 && isUpgradeCode(e.code)) emitUpgrade({ code: e.code, message: e.message });
}

function createQueryClient() {
	return new QueryClient({
		queryCache: new QueryCache({ onError: handleLimit }),
		mutationCache: new MutationCache({ onError: handleLimit }),
		defaultOptions: {
			queries: {
				retry: (count, err) => {
					const s = getApiError(err).status;
					if (s && s >= 400 && s < 500) return false;
					return count < 1;
				},
				refetchOnWindowFocus: false,
			},
			mutations: { retry: 0 },
		},
	});
}

let globalQueryClient: QueryClient | null = null;

export function getOrCreateQueryClient(): QueryClient {
	if (typeof window === "undefined") return createQueryClient();
	if (!globalQueryClient) globalQueryClient = createQueryClient();
	return globalQueryClient;
}
