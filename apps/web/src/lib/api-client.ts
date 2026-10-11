import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { ApiErrorBody } from "@postscript/types";
import { API_URL } from "@/env";
import { getAccessToken, setAccessToken } from "./auth-token";

/** Every request goes to apps/api. The refresh cookie lives on the api host. */
export const apiClient = axios.create({
	baseURL: API_URL,
	withCredentials: true,
	headers: { "content-type": "application/json" },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
	const token = getAccessToken();
	if (token) config.headers.set("authorization", `Bearer ${token}`);
	return config;
});

let refreshing: Promise<string | null> | null = null;

async function requestRefresh(): Promise<string | null> {
	try {
		const res = await axios.post<{ accessToken: string }>("/api/auth/refresh", null, {
			baseURL: API_URL,
			withCredentials: true,
		});
		setAccessToken(res.data.accessToken);
		return res.data.accessToken;
	} catch {
		setAccessToken(null);
		return null;
	}
}

/** Single-flight: concurrent callers share one refresh request. */
export function refreshAccessToken(): Promise<string | null> {
	if (!refreshing) {
		refreshing = requestRefresh().finally(() => {
			refreshing = null;
		});
	}
	return refreshing;
}

const AUTH_FREE_PATHS = [
	"/api/auth/login",
	"/api/auth/register",
	"/api/auth/refresh",
	"/api/auth/forgot-password",
	"/api/auth/reset-password",
	"/api/auth/verify-email",
	"/api/auth/resend-verification",
];

apiClient.interceptors.response.use(
	(res) => res,
	async (error: AxiosError<ApiErrorBody>) => {
		const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
		const isAuthEndpoint = AUTH_FREE_PATHS.some((p) => original?.url?.includes(p));
		if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
			original._retried = true;
			const token = await refreshAccessToken();
			if (token) {
				original.headers.set("authorization", `Bearer ${token}`);
				return apiClient(original);
			}
		}
		return Promise.reject(error);
	},
);

export function getApiError(err: unknown): { message: string; code?: string; status?: number } {
	if (axios.isAxiosError(err)) {
		const body = err.response?.data as ApiErrorBody | undefined;
		return {
			message: body?.error?.message ?? (err.response ? err.message : "Can't reach the server. Check your connection."),
			code: body?.error?.code,
			status: err.response?.status,
		};
	}
	return { message: err instanceof Error ? err.message : "Something went wrong" };
}

/** Full URL to an api path, for plain links (OAuth start, downloads). */
export const apiUrl = (path: string) => `${API_URL}${path}`;
