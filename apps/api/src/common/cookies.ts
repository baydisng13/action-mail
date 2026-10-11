import type { CookieOptions, Response } from "express";
import { isSecureCookies } from "../config/env";
import { REFRESH_TTL_SEC } from "./jwt";

export const REFRESH_COOKIE = "ps_refresh";
export const OAUTH_STATE_COOKIE = "ps_oauth_state";
export const CONNECT_STATE_COOKIE = "ps_connect_state";

function base(): CookieOptions {
	return { httpOnly: true, secure: isSecureCookies(), sameSite: "lax", path: "/api" };
}

export function setRefreshCookie(res: Response, value: string) {
	res.cookie(REFRESH_COOKIE, value, { ...base(), maxAge: REFRESH_TTL_SEC * 1000 });
}
export function clearRefreshCookie(res: Response) {
	res.clearCookie(REFRESH_COOKIE, base());
}
export function setShortCookie(res: Response, name: string, value: string, maxAgeSec = 600) {
	res.cookie(name, value, { ...base(), maxAge: maxAgeSec * 1000 });
}
export function clearCookie(res: Response, name: string) {
	res.clearCookie(name, base());
}
