import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { authIdentities, memberships, teams, users } from "@/db/schema";
import { serverEnv } from "@/env.server";
import { ApiError } from "@/server/lib/http";
import { issueSession, type IssuedSession } from "./session";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

function config() {
	const {
		GOOGLE_CLIENT_ID: clientId,
		GOOGLE_CLIENT_SECRET: clientSecret,
		GOOGLE_REDIRECT_URI: redirectUri,
	} = serverEnv;
	if (!clientId || !clientSecret || !redirectUri) {
		throw new ApiError(
			503,
			"Google sign-in is not configured",
			"google_unconfigured",
		);
	}
	return { clientId, clientSecret, redirectUri };
}

export function isGoogleConfigured(): boolean {
	return Boolean(
		serverEnv.GOOGLE_CLIENT_ID &&
			serverEnv.GOOGLE_CLIENT_SECRET &&
			serverEnv.GOOGLE_REDIRECT_URI,
	);
}

/** Build the Google consent URL. `state` is an anti-CSRF nonce. */
export function buildAuthUrl(state: string): string {
	const { clientId, redirectUri } = config();
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: "openid email profile",
		access_type: "offline",
		include_granted_scopes: "true",
		prompt: "select_account",
		state,
	});
	return `${AUTH_ENDPOINT}?${params}`;
}

interface GoogleProfile {
	sub: string;
	email: string;
	email_verified: boolean;
	name?: string;
	picture?: string;
}

async function exchange(code: string): Promise<GoogleProfile> {
	const { clientId, clientSecret, redirectUri } = config();
	const tokenRes = await fetch(TOKEN_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		}),
	});
	if (!tokenRes.ok) {
		throw new ApiError(401, "Google authorization failed", "google_exchange_failed");
	}
	const { access_token } = (await tokenRes.json()) as { access_token: string };

	const infoRes = await fetch(USERINFO_ENDPOINT, {
		headers: { authorization: `Bearer ${access_token}` },
	});
	if (!infoRes.ok) {
		throw new ApiError(401, "Could not read Google profile", "google_userinfo_failed");
	}
	return (await infoRes.json()) as GoogleProfile;
}

function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
	return `${base || "team"}-${nanoid(6)}`;
}

/**
 * Complete the OAuth callback: upsert the user by Google identity (or link to
 * an existing email account), ensure a personal team exists, and issue a
 * session. Google-verified emails are treated as verified.
 */
export async function handleCallback(
	code: string,
	userAgent?: string | null,
): Promise<IssuedSession> {
	const profile = await exchange(code);
	const emailNorm = profile.email.toLowerCase().trim();

	const userId = await db.transaction(async (tx) => {
		// 1. Existing Google identity?
		const [identity] = await tx
			.select()
			.from(authIdentities)
			.where(
				and(
					eq(authIdentities.provider, "google"),
					eq(authIdentities.providerUid, profile.sub),
				),
			)
			.limit(1);
		if (identity) return identity.userId;

		// 2. Existing account with the same email → link Google to it.
		const [existing] = await tx
			.select()
			.from(users)
			.where(eq(users.email, emailNorm))
			.limit(1);
		if (existing) {
			await tx.insert(authIdentities).values({
				userId: existing.id,
				provider: "google",
				providerUid: profile.sub,
			});
			if (!existing.emailVerifiedAt) {
				await tx
					.update(users)
					.set({ emailVerifiedAt: new Date() })
					.where(eq(users.id, existing.id));
			}
			return existing.id;
		}

		// 3. Brand-new user → create user + identity + personal team.
		const fullName = profile.name || emailNorm.split("@")[0];
		const [user] = await tx
			.insert(users)
			.values({
				fullName,
				email: emailNorm,
				emailVerifiedAt: new Date(),
				avatarUrl: profile.picture,
			})
			.returning({ id: users.id });

		await tx.insert(authIdentities).values({
			userId: user.id,
			provider: "google",
			providerUid: profile.sub,
		});

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

	const [personal] = await db
		.select({ id: teams.id })
		.from(teams)
		.where(and(eq(teams.ownerUserId, userId), eq(teams.isPersonal, true)))
		.limit(1);

	return issueSession(userId, personal.id, userAgent);
}
