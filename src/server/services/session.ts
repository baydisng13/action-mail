import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { memberships, refreshTokens } from "@/db/schema";
import {
	type AccessClaims,
	REFRESH_TTL_SEC,
	signAccessToken,
} from "@/server/lib/jwt";
import { generateSecret, hashSecret } from "@/server/lib/tokens";

export interface IssuedSession {
	accessToken: string;
	refreshSecret: string;
	claims: AccessClaims;
}

/** Resolve a user's membership in a team → access-token claims. */
async function claimsFor(
	userId: string,
	teamId: string,
): Promise<AccessClaims> {
	const [m] = await db
		.select()
		.from(memberships)
		.where(
			and(eq(memberships.userId, userId), eq(memberships.teamId, teamId)),
		)
		.limit(1);
	if (!m) throw new Error("membership not found");
	return { sub: userId, activeTeamId: teamId, role: m.role, plan: m.plan };
}

/** Create a fresh session (access token + persisted rotating refresh token). */
export async function issueSession(
	userId: string,
	teamId: string,
	userAgent?: string | null,
): Promise<IssuedSession> {
	const claims = await claimsFor(userId, teamId);
	const accessToken = await signAccessToken(claims);
	const { secret, hash } = generateSecret();

	await db.insert(refreshTokens).values({
		userId,
		teamId,
		tokenHash: hash,
		userAgent: userAgent ?? null,
		expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
	});

	return { accessToken, refreshSecret: secret, claims };
}

/**
 * Validate a refresh secret, revoke it, and issue a replacement (rotation).
 * Returns null if the token is unknown, expired, or already revoked.
 */
export async function rotateSession(
	refreshSecret: string,
	userAgent?: string | null,
): Promise<IssuedSession | null> {
	const hash = hashSecret(refreshSecret);
	const [row] = await db
		.select()
		.from(refreshTokens)
		.where(
			and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)),
		)
		.limit(1);

	if (!row || row.expiresAt.getTime() < Date.now()) return null;

	// Revoke the presented token, then mint a new one (single-use rotation).
	await db
		.update(refreshTokens)
		.set({ revokedAt: new Date() })
		.where(eq(refreshTokens.id, row.id));

	return issueSession(row.userId, row.teamId ?? "", userAgent);
}

export async function revokeSession(refreshSecret: string): Promise<void> {
	const hash = hashSecret(refreshSecret);
	await db
		.update(refreshTokens)
		.set({ revokedAt: new Date() })
		.where(eq(refreshTokens.tokenHash, hash));
}

/** Revoke every active session for a user (e.g. on password change). */
export async function revokeAllSessions(userId: string): Promise<void> {
	await db
		.update(refreshTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
		);
}
