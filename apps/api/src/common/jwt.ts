import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env";

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

const accessKey = () => new TextEncoder().encode(env().JWT_ACCESS_SECRET);
const stateKey = () => new TextEncoder().encode(env().JWT_REFRESH_SECRET);

export interface AccessClaims {
	sub: string;
	org: string;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
	return new SignJWT({ org: claims.org })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(claims.sub)
		.setIssuedAt()
		.setExpirationTime(`${ACCESS_TTL_SEC}s`)
		.setIssuer("postscript")
		.sign(accessKey());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
	try {
		const { payload } = await jwtVerify(token, accessKey(), { issuer: "postscript" });
		if (!payload.sub || typeof payload.org !== "string") return null;
		return { sub: payload.sub, org: payload.org };
	} catch {
		return null;
	}
}

/** Short-lived signed payload (OAuth `state`). */
export async function signStateToken(payload: Record<string, string>, ttlSec = 600): Promise<string> {
	return new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${ttlSec}s`)
		.setIssuer("postscript:state")
		.sign(stateKey());
}

export async function verifyStateToken(token: string): Promise<Record<string, string> | null> {
	try {
		const { payload } = await jwtVerify(token, stateKey(), { issuer: "postscript:state" });
		return payload as Record<string, string>;
	} catch {
		return null;
	}
}
