import { jwtVerify, SignJWT } from "jose";
import { serverEnv } from "@/env.server";

export const ACCESS_TTL_SEC = 15 * 60; // 15 minutes
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

const accessSecret = new TextEncoder().encode(serverEnv.JWT_ACCESS_SECRET);

export interface AccessClaims {
	sub: string; // user id
	activeTeamId: string;
	role: "owner" | "admin" | "member";
	plan: "free" | "pro" | "team";
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
	return new SignJWT({ ...claims })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${ACCESS_TTL_SEC}s`)
		.setIssuer("postscript")
		.sign(accessSecret);
}

export async function verifyAccessToken(
	token: string,
): Promise<AccessClaims | null> {
	try {
		const { payload } = await jwtVerify(token, accessSecret, {
			issuer: "postscript",
		});
		return {
			sub: payload.sub as string,
			activeTeamId: payload.activeTeamId as string,
			role: payload.role as AccessClaims["role"],
			plan: payload.plan as AccessClaims["plan"],
		};
	} catch {
		return null;
	}
}

/** Sign an arbitrary short-lived payload (e.g. OAuth `state`). */
export async function signStateToken(
	payload: Record<string, string>,
	ttlSec = 300,
): Promise<string> {
	return new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${ttlSec}s`)
		.setIssuer("postscript:state")
		.sign(accessSecret);
}

export async function verifyStateToken(
	token: string,
): Promise<Record<string, string> | null> {
	try {
		const { payload } = await jwtVerify(token, accessSecret, {
			issuer: "postscript:state",
		});
		return payload as Record<string, string>;
	} catch {
		return null;
	}
}
