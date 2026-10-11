import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { generateSecret, hashSecret } from "../common/crypto";
import { REFRESH_TTL_SEC, signAccessToken } from "../common/jwt";
import { DB, type Db } from "../db/db";
import { memberships, organizations, refreshTokens, users } from "../db/schema";

export interface IssuedSession {
	accessToken: string;
	refreshSecret: string;
	orgId: string;
}

@Injectable()
export class SessionService {
	constructor(@Inject(DB) private readonly db: Db) {}

	/** Pick the workspace for a session: the requested one if still a member, else personal, else any. */
	async resolveOrg(userId: string, preferred?: string | null): Promise<string> {
		const rows = await this.db
			.select({ orgId: memberships.organizationId, personal: organizations.isPersonal })
			.from(memberships)
			.innerJoin(organizations, eq(organizations.id, memberships.organizationId))
			.where(eq(memberships.userId, userId))
			.orderBy(asc(memberships.createdAt));
		if (preferred && rows.some((r) => r.orgId === preferred)) return preferred;
		const personal = rows.find((r) => r.personal);
		if (personal) return personal.orgId;
		if (rows[0]) return rows[0].orgId;
		throw new Error("user has no workspace");
	}

	async issue(userId: string, preferredOrg?: string | null, userAgent?: string | null): Promise<IssuedSession> {
		const orgId = await this.resolveOrg(userId, preferredOrg);
		const accessToken = await signAccessToken({ sub: userId, org: orgId });
		const { secret, hash } = generateSecret();
		await this.db.insert(refreshTokens).values({
			userId,
			organizationId: orgId,
			tokenHash: hash,
			userAgent: userAgent?.slice(0, 300) ?? null,
			expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
		});
		await this.db.update(users).set({ lastActiveOrgId: orgId }).where(eq(users.id, userId));
		return { accessToken, refreshSecret: secret, orgId };
	}

	/** Single-use rotation. Returns null for unknown, expired or reused tokens. */
	async rotate(refreshSecret: string, userAgent?: string | null, switchTo?: string): Promise<IssuedSession | null> {
		const hash = hashSecret(refreshSecret);
		const [row] = await this.db
			.update(refreshTokens)
			.set({ revokedAt: new Date() })
			.where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
			.returning();
		if (!row || row.expiresAt.getTime() < Date.now()) return null;
		return this.issue(row.userId, switchTo ?? row.organizationId, userAgent);
	}

	async userForRefresh(refreshSecret: string): Promise<string | null> {
		const [row] = await this.db
			.select({ userId: refreshTokens.userId })
			.from(refreshTokens)
			.where(eq(refreshTokens.tokenHash, hashSecret(refreshSecret)))
			.limit(1);
		return row?.userId ?? null;
	}

	async revoke(refreshSecret: string) {
		await this.db
			.update(refreshTokens)
			.set({ revokedAt: new Date() })
			.where(eq(refreshTokens.tokenHash, hashSecret(refreshSecret)));
	}

	async revokeAll(userId: string) {
		await this.db
			.update(refreshTokens)
			.set({ revokedAt: new Date() })
			.where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
	}
}
