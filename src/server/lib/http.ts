import {
	type CookieSerializeOptions,
	parse,
	serialize,
} from "cookie-es";
import { serverEnv } from "@/env.server";
import { REFRESH_TTL_SEC } from "./jwt";

export const REFRESH_COOKIE = "ps_refresh";

/** A handled, client-safe error. Anything else becomes a generic 500. */
export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public code?: string,
	) {
		super(message);
	}
}

export function json(data: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"content-type": "application/json",
			...init?.headers,
		},
	});
}

/** Wrap a handler so thrown ApiErrors become clean JSON responses. */
export function handler(
	fn: (ctx: { request: Request }) => Promise<Response>,
) {
	return async ({ request }: { request: Request }): Promise<Response> => {
		try {
			return await fn({ request });
		} catch (err) {
			if (err instanceof ApiError) {
				return json(
					{ error: { message: err.message, code: err.code } },
					{ status: err.status },
				);
			}
			console.error("[api] unhandled error", err);
			return json(
				{ error: { message: "Internal server error" } },
				{ status: 500 },
			);
		}
	};
}

export function getCookie(request: Request, name: string): string | undefined {
	const header = request.headers.get("cookie");
	if (!header) return undefined;
	return parse(header)[name];
}

const baseCookie: CookieSerializeOptions = {
	httpOnly: true,
	secure: serverEnv.NODE_ENV === "production",
	sameSite: "lax",
	path: "/",
};

export function refreshCookie(value: string): string {
	return serialize(REFRESH_COOKIE, value, {
		...baseCookie,
		maxAge: REFRESH_TTL_SEC,
	});
}

export function clearRefreshCookie(): string {
	return serialize(REFRESH_COOKIE, "", { ...baseCookie, maxAge: 0 });
}

export const OAUTH_STATE_COOKIE = "ps_oauth_state";

export function oauthStateCookie(value: string): string {
	return serialize(OAUTH_STATE_COOKIE, value, {
		...baseCookie,
		maxAge: 10 * 60, // 10 minutes to complete the flow
	});
}

export function clearOauthStateCookie(): string {
	return serialize(OAUTH_STATE_COOKIE, "", { ...baseCookie, maxAge: 0 });
}

export const CONNECT_STATE_COOKIE = "ps_connect_state";

export function connectStateCookie(value: string): string {
	return serialize(CONNECT_STATE_COOKIE, value, {
		...baseCookie,
		maxAge: 5 * 60,
	});
}

export function clearConnectStateCookie(): string {
	return serialize(CONNECT_STATE_COOKIE, "", { ...baseCookie, maxAge: 0 });
}
