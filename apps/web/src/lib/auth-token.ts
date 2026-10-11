/**
 * In-memory access-token store. The token deliberately lives in a module
 * variable (not localStorage) so it's never exposed to XSS-readable storage.
 * The long-lived refresh token lives in an httpOnly cookie the JS can't read.
 */
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
	return accessToken;
}

export function setAccessToken(token: string | null): void {
	accessToken = token;
	for (const fn of listeners) fn(token);
}

export function subscribeAccessToken(
	fn: (token: string | null) => void,
): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
