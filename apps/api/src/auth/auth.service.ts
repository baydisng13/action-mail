import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { LoginInput, RegisterInput } from "@postscript/types";
import { and, eq } from "drizzle-orm";
import { env, features, googleRedirectUri } from "../config/env";
import { generateSecret, hashPassword, hashSecret, verifyPassword } from "../common/crypto";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { DB, type Db } from "../db/db";
import { authIdentities, memberships, organizations, users, verificationTokens } from "../db/schema";
import { EmailService, templates } from "../email/email.service";
import { type IssuedSession, SessionService } from "./session.service";

const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;

export function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
	return `${base || "workspace"}-${randomBytes(3).toString("hex")}`;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Every user gets a personal workspace (single-person use) on signup. */
export async function createPersonalWorkspace(tx: Tx | Db, userId: string, fullName: string) {
	const first = fullName.split(" ")[0] || fullName;
	const [org] = await tx
		.insert(organizations)
		.values({ name: `${first}'s workspace`, slug: slugify(fullName), ownerUserId: userId, isPersonal: true })
		.returning();
	await tx.insert(memberships).values({ userId, organizationId: org.id, role: "owner" });
	return org;
}

@Injectable()
export class AuthService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly sessions: SessionService,
		private readonly email: EmailService,
	) {}

	private async findByEmail(email: string) {
		const [u] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
		return u ?? null;
	}

	/**
	 * Register. When outbound email is not configured there is no way to
	 * deliver a verification link, so the account is verified at once and a
	 * session is returned; otherwise the user must click the emailed link.
	 */
	async register(input: RegisterInput, userAgent?: string | null): Promise<{ userId: string; needsVerification: boolean; session?: IssuedSession }> {
		const email = input.email.toLowerCase().trim();
		if (await this.findByEmail(email)) throw new ApiError(409, "An account with that email already exists", "email_taken");
		const passwordHash = await hashPassword(input.password);
		const autoVerify = !features.email();
		const userId = await this.db.transaction(async (tx) => {
			const [u] = await tx
				.insert(users)
				.values({ fullName: input.fullName, email, passwordHash, emailVerifiedAt: autoVerify ? new Date() : null })
				.returning({ id: users.id });
			await createPersonalWorkspace(tx, u.id, input.fullName);
			return u.id;
		});
		log.info("auth.registered", { userId, autoVerify });
		if (autoVerify) return { userId, needsVerification: false, session: await this.sessions.issue(userId, null, userAgent) };
		await this.sendVerification(userId, email);
		return { userId, needsVerification: true };
	}

	private async sendVerification(userId: string, to: string) {
		const { secret, hash } = generateSecret();
		await this.db.insert(verificationTokens).values({
			userId,
			type: "email_verification",
			tokenHash: hash,
			expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
		});
		await this.email.send({ to, ...templates.verify(`${env().APP_URL}/verify-email?token=${secret}`) });
	}

	async login(input: LoginInput, userAgent?: string | null): Promise<IssuedSession> {
		const user = await this.findByEmail(input.email);
		// Same answer for unknown email and wrong password.
		if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
			throw new ApiError(401, "Invalid email or password", "invalid_credentials");
		}
		if (!user.emailVerifiedAt) throw new ApiError(403, "Please verify your email before signing in", "email_unverified");
		return this.sessions.issue(user.id, user.lastActiveOrgId, userAgent);
	}

	private async consumeToken(token: string, type: "email_verification" | "password_reset") {
		const [row] = await this.db
			.update(verificationTokens)
			.set({ usedAt: new Date() })
			.where(and(eq(verificationTokens.tokenHash, hashSecret(token)), eq(verificationTokens.type, type)))
			.returning();
		if (!row || (row.usedAt && row.usedAt.getTime() < Date.now() - 1000) || row.expiresAt.getTime() < Date.now()) {
			throw new ApiError(400, "This link is invalid or has expired", "invalid_token");
		}
		return row;
	}

	async verifyEmail(token: string) {
		const [pre] = await this.db
			.select()
			.from(verificationTokens)
			.where(eq(verificationTokens.tokenHash, hashSecret(token)))
			.limit(1);
		if (!pre || pre.usedAt) throw new ApiError(400, "This link is invalid or has expired", "invalid_token");
		const row = await this.consumeToken(token, "email_verification");
		await this.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
	}

	async resendVerification(emailRaw: string) {
		const u = await this.findByEmail(emailRaw);
		if (u && !u.emailVerifiedAt) await this.sendVerification(u.id, u.email);
	}

	async forgotPassword(emailRaw: string) {
		const u = await this.findByEmail(emailRaw);
		if (!u) return; // no user enumeration
		const { secret, hash } = generateSecret();
		await this.db.insert(verificationTokens).values({
			userId: u.id,
			type: "password_reset",
			tokenHash: hash,
			expiresAt: new Date(Date.now() + RESET_TTL_MS),
		});
		await this.email.send({ to: u.email, ...templates.reset(`${env().APP_URL}/reset-password?token=${secret}`) });
	}

	async resetPassword(token: string, password: string) {
		const [pre] = await this.db
			.select()
			.from(verificationTokens)
			.where(eq(verificationTokens.tokenHash, hashSecret(token)))
			.limit(1);
		if (!pre || pre.usedAt) throw new ApiError(400, "This link is invalid or has expired", "invalid_token");
		const row = await this.consumeToken(token, "password_reset");
		await this.db
			.update(users)
			.set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date() })
			.where(eq(users.id, row.userId));
		await this.sessions.revokeAll(row.userId);
	}

	async changePassword(userId: string, current: string | undefined, next: string) {
		const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
		if (!u) throw new ApiError(404, "User not found");
		if (u.passwordHash) {
			if (!current) throw new ApiError(400, "Enter your current password", "current_required");
			if (!(await verifyPassword(current, u.passwordHash))) throw new ApiError(400, "Current password is incorrect", "bad_password");
		}
		await this.db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
	}

	// ─── Google sign-in ─────────────────────────────────────────────────────
	googleAuthUrl(state: string): string {
		const e = env();
		if (!features.google()) throw new ApiError(503, "Google sign-in is not configured yet", "google_unconfigured");
		const params = new URLSearchParams({
			client_id: e.GOOGLE_CLIENT_ID as string,
			redirect_uri: googleRedirectUri(),
			response_type: "code",
			scope: "openid email profile",
			prompt: "select_account",
			state,
		});
		return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
	}

	async googleCallback(code: string, userAgent?: string | null): Promise<IssuedSession> {
		const e = env();
		const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: e.GOOGLE_CLIENT_ID as string,
				client_secret: e.GOOGLE_CLIENT_SECRET as string,
				redirect_uri: googleRedirectUri(),
				grant_type: "authorization_code",
			}),
		});
		if (!tokenRes.ok) throw new ApiError(401, "Google sign-in failed", "google_exchange_failed");
		const { access_token } = (await tokenRes.json()) as { access_token: string };
		const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
			headers: { authorization: `Bearer ${access_token}` },
		});
		if (!infoRes.ok) throw new ApiError(401, "Could not read your Google profile", "google_userinfo_failed");
		const profile = (await infoRes.json()) as { sub: string; email: string; email_verified: boolean; name?: string; picture?: string };
		if (!profile.email_verified) throw new ApiError(403, "Your Google email is not verified", "google_unverified");
		const email = profile.email.toLowerCase().trim();

		const userId = await this.db.transaction(async (tx) => {
			const [identity] = await tx
				.select()
				.from(authIdentities)
				.where(and(eq(authIdentities.provider, "google"), eq(authIdentities.providerUid, profile.sub)))
				.limit(1);
			if (identity) return identity.userId;
			const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
			if (existing) {
				await tx.insert(authIdentities).values({ userId: existing.id, provider: "google", providerUid: profile.sub });
				if (!existing.emailVerifiedAt) await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, existing.id));
				return existing.id;
			}
			const fullName = profile.name || email.split("@")[0];
			const [u] = await tx
				.insert(users)
				.values({ fullName, email, emailVerifiedAt: new Date(), avatarUrl: profile.picture })
				.returning({ id: users.id });
			await tx.insert(authIdentities).values({ userId: u.id, provider: "google", providerUid: profile.sub });
			await createPersonalWorkspace(tx, u.id, fullName);
			return u.id;
		});
		const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
		return this.sessions.issue(userId, u?.lastActiveOrgId, userAgent);
	}
}
