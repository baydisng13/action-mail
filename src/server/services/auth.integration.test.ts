import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
	refreshTokens,
	teams,
	users,
	verificationTokens,
} from "@/db/schema";
import { ApiError } from "@/server/lib/http";
import { generateSecret } from "@/server/lib/tokens";
import { getMe } from "./account";
import { login, register, verifyEmail } from "./auth";
import { revokeSession, rotateSession } from "./session";

/**
 * End-to-end auth flow against a REAL database. Skipped unless INTEGRATION=1.
 * Run with:  INTEGRATION=1 DATABASE_URL=<neon-url> pnpm test
 * (Push the schema first: `pnpm db:push`.)
 */
const run = process.env.INTEGRATION ? describe : describe.skip;

run("auth flow (integration)", () => {
	const emailAddr = `test-${nanoid(8)}@example.com`.toLowerCase();
	let userId: string;

	afterAll(async () => {
		if (!userId) return;
		await db.delete(teams).where(eq(teams.ownerUserId, userId));
		await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
		await db
			.delete(verificationTokens)
			.where(eq(verificationTokens.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it("registers, auto-creating a personal team + owner membership", async () => {
		const res = await register({
			fullName: "Integration Tester",
			email: emailAddr,
			password: "longenough1",
		});
		userId = res.userId;
		expect(userId).toBeTruthy();

		const [team] = await db
			.select()
			.from(teams)
			.where(eq(teams.ownerUserId, userId));
		expect(team.isPersonal).toBe(true);
	});

	it("blocks login until the email is verified", async () => {
		await expect(
			login({ email: emailAddr, password: "longenough1" }),
		).rejects.toMatchObject({ code: "email_unverified" } as Partial<ApiError>);
	});

	it("verifies the email with a valid token", async () => {
		const { secret, hash } = generateSecret();
		await db.insert(verificationTokens).values({
			userId,
			type: "email_verification",
			tokenHash: hash,
			expiresAt: new Date(Date.now() + 60_000),
		});
		await verifyEmail({ token: secret });

		const [u] = await db.select().from(users).where(eq(users.id, userId));
		expect(u.emailVerifiedAt).not.toBeNull();
	});

	it("logs in, then /me returns the active team + entitlements", async () => {
		const session = await login({
			email: emailAddr,
			password: "longenough1",
		});
		expect(session.accessToken).toBeTruthy();
		expect(session.refreshSecret).toBeTruthy();

		const me = await getMe(session.claims.sub, session.claims.activeTeamId);
		expect(me.user.email).toBe(emailAddr);
		expect(me.activeTeam.role).toBe("owner");
		expect(me.entitlements).toContain("journals");

		// Refresh rotates to a new, different token.
		const rotated = await rotateSession(session.refreshSecret);
		expect(rotated?.refreshSecret).toBeTruthy();
		expect(rotated?.refreshSecret).not.toBe(session.refreshSecret);

		// The old (already-rotated) token can no longer be used.
		expect(await rotateSession(session.refreshSecret)).toBeNull();

		// Logout revokes the current token.
		if (rotated) {
			await revokeSession(rotated.refreshSecret);
			expect(await rotateSession(rotated.refreshSecret)).toBeNull();
		}
	});

	it("rejects duplicate registration", async () => {
		await expect(
			register({
				fullName: "Dupe",
				email: emailAddr,
				password: "longenough1",
			}),
		).rejects.toMatchObject({ code: "email_taken" } as Partial<ApiError>);
	});
});
