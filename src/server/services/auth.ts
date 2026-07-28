import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
	memberships,
	teams,
	users,
	verificationTokens,
} from "@/db/schema";
import {
	email,
	passwordResetEmail,
	verificationEmail,
} from "@/server/lib/email";
import { ApiError } from "@/server/lib/http";
import { hashPassword, verifyPassword } from "@/server/lib/password";
import { generateSecret, hashSecret } from "@/server/lib/tokens";
import { serverEnv } from "@/env.server";
import {
	forgotPasswordSchema,
	loginSchema,
	registerSchema,
	resetPasswordSchema,
	verifyEmailSchema,
} from "@/features/auth/schemas";
import { issueSession, type IssuedSession, revokeAllSessions } from "./session";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
	return `${base || "team"}-${nanoid(6)}`;
}

/**
 * Send email without letting a provider outage break the caller. The
 * verification/reset token is already persisted, so the user can always
 * request a resend — a failed send must never 500 a registration or leave a
 * half-created account.
 */
async function safeSend(msg: Parameters<typeof email.send>[0]): Promise<void> {
	try {
		await email.send(msg);
	} catch (err) {
		console.error("[email] send failed (non-fatal)", err);
	}
}

async function sendVerification(userId: string, to: string): Promise<void> {
	const { secret, hash } = generateSecret();
	await db.insert(verificationTokens).values({
		userId,
		type: "email_verification",
		tokenHash: hash,
		expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
	});
	const link = `${serverEnv.APP_URL}/verify-email?token=${secret}`;
	await safeSend({ to, ...verificationEmail(link) });
}

/**
 * Register a new account. Creates the user, an auto personal team (SaaS
 * default), and an owner membership — all atomically — then sends a
 * verification email. No session is issued until the email is verified.
 */
export async function register(input: unknown): Promise<{ userId: string }> {
	const { fullName, email: rawEmail, password } = registerSchema.parse(input);
	const emailNorm = rawEmail.toLowerCase().trim();

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, emailNorm))
		.limit(1);
	if (existing.length) {
		throw new ApiError(409, "An account with that email already exists", "email_taken");
	}

	const passwordHash = await hashPassword(password);

	const userId = await db.transaction(async (tx) => {
		const [user] = await tx
			.insert(users)
			.values({ fullName, email: emailNorm, passwordHash })
			.returning({ id: users.id });

		const [team] = await tx
			.insert(teams)
			.values({
				name: `${fullName}'s Team`,
				slug: slugify(fullName),
				ownerUserId: user.id,
				isPersonal: true,
			})
			.returning({ id: teams.id });

		await tx.insert(memberships).values({
			userId: user.id,
			teamId: team.id,
			role: "owner",
			plan: "free",
			status: "active",
		});

		return user.id;
	});

	await sendVerification(userId, emailNorm);
	return { userId };
}

/** Log in with email + password. Blocks unverified accounts (hard gate). */
export async function login(
	input: unknown,
	userAgent?: string | null,
): Promise<IssuedSession & { userId: string }> {
	const { email: rawEmail, password } = loginSchema.parse(input);
	const emailNorm = rawEmail.toLowerCase().trim();

	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, emailNorm))
		.limit(1);

	// Constant-ish response: reject unknown user and bad password identically.
	if (!user || !user.passwordHash) {
		throw new ApiError(401, "Invalid email or password", "invalid_credentials");
	}
	const ok = await verifyPassword(password, user.passwordHash);
	if (!ok) {
		throw new ApiError(401, "Invalid email or password", "invalid_credentials");
	}
	if (!user.emailVerifiedAt) {
		throw new ApiError(
			403,
			"Please verify your email before signing in",
			"email_unverified",
		);
	}

	const [personal] = await db
		.select({ id: teams.id })
		.from(teams)
		.where(and(eq(teams.ownerUserId, user.id), eq(teams.isPersonal, true)))
		.limit(1);

	const session = await issueSession(user.id, personal.id, userAgent);
	return { ...session, userId: user.id };
}

export async function verifyEmail(input: unknown): Promise<void> {
	const { token } = verifyEmailSchema.parse(input);
	const hash = hashSecret(token);

	const [row] = await db
		.select()
		.from(verificationTokens)
		.where(
			and(
				eq(verificationTokens.tokenHash, hash),
				eq(verificationTokens.type, "email_verification"),
			),
		)
		.limit(1);

	if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
		throw new ApiError(400, "Invalid or expired verification link", "invalid_token");
	}

	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ emailVerifiedAt: new Date() })
			.where(eq(users.id, row.userId));
		await tx
			.update(verificationTokens)
			.set({ usedAt: new Date() })
			.where(eq(verificationTokens.id, row.id));
	});
}

export async function resendVerification(input: unknown): Promise<void> {
	const { email: rawEmail } = forgotPasswordSchema.parse(input);
	const emailNorm = rawEmail.toLowerCase().trim();
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, emailNorm))
		.limit(1);
	// Don't leak whether the account exists / is already verified.
	if (user && !user.emailVerifiedAt) {
		await sendVerification(user.id, emailNorm);
	}
}

export async function forgotPassword(input: unknown): Promise<void> {
	const { email: rawEmail } = forgotPasswordSchema.parse(input);
	const emailNorm = rawEmail.toLowerCase().trim();
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, emailNorm))
		.limit(1);

	// Always succeed to avoid user enumeration.
	if (!user) return;

	const { secret, hash } = generateSecret();
	await db.insert(verificationTokens).values({
		userId: user.id,
		type: "password_reset",
		tokenHash: hash,
		expiresAt: new Date(Date.now() + RESET_TTL_MS),
	});
	const link = `${serverEnv.APP_URL}/reset-password?token=${secret}`;
	await safeSend({ to: emailNorm, ...passwordResetEmail(link) });
}

export async function resetPassword(input: unknown): Promise<void> {
	const { token, password } = resetPasswordSchema.parse(input);
	const hash = hashSecret(token);

	const [row] = await db
		.select()
		.from(verificationTokens)
		.where(
			and(
				eq(verificationTokens.tokenHash, hash),
				eq(verificationTokens.type, "password_reset"),
			),
		)
		.limit(1);

	if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
		throw new ApiError(400, "Invalid or expired reset link", "invalid_token");
	}

	const passwordHash = await hashPassword(password);
	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ passwordHash })
			.where(eq(users.id, row.userId));
		await tx
			.update(verificationTokens)
			.set({ usedAt: new Date() })
			.where(eq(verificationTokens.id, row.id));
	});
	// A password reset invalidates every existing session.
	await revokeAllSessions(row.userId);
}

export async function changePassword(
	userId: string,
	currentPassword: string | undefined,
	newPassword: string,
): Promise<void> {
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) throw new ApiError(404, "User not found");

	// An account that already has a password must prove the current one.
	// A Google-only account (no password yet) can set one without it.
	if (user.passwordHash) {
		if (!currentPassword) {
			throw new ApiError(400, "Current password is required", "current_required");
		}
		const ok = await verifyPassword(currentPassword, user.passwordHash);
		if (!ok) throw new ApiError(400, "Current password is incorrect", "bad_password");
	}
	const passwordHash = await hashPassword(newPassword);
	await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
	// Note: current session stays valid (deliberate, authenticated change).
}
