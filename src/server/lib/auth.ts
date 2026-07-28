import { type AccessClaims, verifyAccessToken } from "./jwt";
import { ApiError } from "./http";

/** Extract + verify the bearer access token, or throw 401. */
export async function requireAuth(request: Request): Promise<AccessClaims> {
	const header = request.headers.get("authorization");
	const token = header?.toLowerCase().startsWith("bearer ")
		? header.slice(7).trim()
		: undefined;
	if (!token) {
		throw new ApiError(401, "Not authenticated", "unauthenticated");
	}
	const claims = await verifyAccessToken(token);
	if (!claims) {
		throw new ApiError(401, "Invalid or expired session", "invalid_token");
	}
	return claims;
}
