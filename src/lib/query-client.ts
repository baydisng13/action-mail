import { QueryClient } from "@tanstack/react-query";

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: 1,
				refetchOnWindowFocus: false,
			},
			mutations: {
				retry: 0,
			},
		},
	});
}

export function getOrCreateQueryClient(): QueryClient {
	if (!globalQueryClient) {
		globalQueryClient = createQueryClient();
	}
	return globalQueryClient;
}

let globalQueryClient: QueryClient | null = null;
