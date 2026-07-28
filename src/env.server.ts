import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Server-only env. Reads from `process.env`.
 * NEVER import this from client/component code — it exposes secrets.
 */
export const serverEnv = createEnv({
	server: {
		// Database — you supply this (Neon connection string).
		DATABASE_URL: z.string().url(),

		// JWT signing secrets. Generate with: openssl rand -base64 48
		JWT_ACCESS_SECRET: z.string().min(32),
		JWT_REFRESH_SECRET: z.string().min(32),

		// Google OAuth (console.cloud.google.com → Credentials → OAuth client).
		GOOGLE_CLIENT_ID: z.string().optional(),
		GOOGLE_CLIENT_SECRET: z.string().optional(),
		GOOGLE_REDIRECT_URI: z.string().url().optional(),
		// Redirect URI for CONNECTING a Gmail mailbox (distinct from sign-in).
		GMAIL_CONNECT_REDIRECT_URI: z.string().url().optional(),

		// AES-256-GCM key for encrypting stored mailbox OAuth tokens at rest.
		// Generate with: openssl rand -base64 32
		MAILBOX_ENCRYPTION_KEY: z.string().min(44),

		// Shared secret authenticating internal self-invoked sync steps (and cron).
		// Generate with: openssl rand -base64 32
		SYNC_SECRET: z.string().min(16),

		// AI layer (PRD §8.3 — swappable). DeepSeek by default via its
		// OpenAI-compatible API. Swap model/base to change providers.
		AI_API_KEY: z.string().optional(),
		AI_MODEL: z.string().default("deepseek-chat"),
		AI_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),

		// Transactional email. Optional in dev — links log to the console.
		RESEND_API_KEY: z.string().optional(),
		EMAIL_FROM: z.string().default("Postscript <onboarding@resend.dev>"),

		// Public base URL of this app (used in verification / reset links).
		APP_URL: z.string().url().default("http://localhost:3000"),

		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},

	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
