import axios, {
	type AxiosError,
	type AxiosRequestConfig,
	type InternalAxiosRequestConfig,
} from "axios";
import { env } from "@/env";
import { getAccessToken, setAccessToken } from "./auth-token";

/** Shape of a handled server error (see server/lib/http.ts `ApiError`). */
export interface ApiErrorBody {
	error: { message: string; code?: string };
}

export const apiClient = axios.create({
	baseURL: env.VITE_API_URL || "",
	withCredentials: true, // send the refresh cookie on same-origin requests
	headers: { "content-type": "application/json" },
});

// Attach the in-memory access token to every request.
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
	const token = getAccessToken();
	if (token) config.headers.set("authorization", `Bearer ${token}`);
	return config;
});

// ─── Single-flight refresh on 401 ──────────────────────────────────────────────
let refreshing: Promise<string | null> | null = null;

/** POST /api/auth/refresh directly (bypasses interceptors to avoid loops). */
async function requestRefresh(): Promise<string | null> {
	try {
		const res = await axios.post<{ accessToken: string }>(
			"/api/auth/refresh",
			null,
			{ baseURL: env.VITE_API_URL || "", withCredentials: true },
		);
		setAccessToken(res.data.accessToken);
		return res.data.accessToken;
	} catch {
		setAccessToken(null);
		return null;
	}
}

/** Ensure only one refresh runs at a time; callers await the same promise. */
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
		const original = error.config as
			| (InternalAxiosRequestConfig & { _retried?: boolean })
			| undefined;

		const isAuthEndpoint = AUTH_FREE_PATHS.some((p) =>
			original?.url?.includes(p),
		);

		if (
			error.response?.status === 401 &&
			original &&
			!original._retried &&
			!isAuthEndpoint
		) {
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

/** Narrow an unknown thrown value to the server's error message + code. */
export function getApiError(err: unknown): {
	message: string;
	code?: string;
	status?: number;
} {
	if (axios.isAxiosError(err)) {
		const body = err.response?.data as ApiErrorBody | undefined;
		return {
			message: body?.error?.message ?? err.message,
			code: body?.error?.code,
			status: err.response?.status,
		};
	}
	return { message: "Something went wrong" };
}

export type { AxiosRequestConfig };
