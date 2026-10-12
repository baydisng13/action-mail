import { z } from "zod";
import { setting } from "./settings.store";

const optional = z
	.string()
	.optional()
	.transform((v) => (v && v.trim() ? v.trim() : undefined));

/** Like `optional`, but numeric with a default: "" (compose's unset convention) falls back too. */
const optionalNumber = (def: number) =>
	z
		.string()
		.optional()
		.transform((v) => (v && v.trim() ? Number(v.trim()) : def))
		.pipe(z.number().positive());

/** Like `optional`, but a "true"/"false" string with a default. */
const optionalBool = (def: "true" | "false") =>
	z
		.string()
		.optional()
		.transform((v) => (v && v.trim() ? v.trim() : def));

const schema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().default(3000),
	DATABASE_URL: z.string().min(1),
	REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

	JWT_ACCESS_SECRET: z.string().min(32),
	JWT_REFRESH_SECRET: z.string().min(32),
	MAILBOX_ENCRYPTION_KEY: z.string().min(44),

	/** Public URL of the web app (CORS origin, links in emails). */
	APP_URL: z.string().url().default("http://localhost:3000"),
	/** Public URL of this api (OAuth redirect defaults). */
	API_URL: z.string().url().default("http://localhost:3001"),

	PLATFORM_ADMIN_EMAILS: z.string().default(""),
	RUN_MIGRATIONS: z.string().default("true"),
	LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

	// Optional integrations: each feature reports "not configured" when unset.
	GOOGLE_CLIENT_ID: optional,
	GOOGLE_CLIENT_SECRET: optional,
	GOOGLE_REDIRECT_URI: optional,
	GMAIL_CONNECT_REDIRECT_URI: optional,

	AI_API_KEY: optional,
	AI_MODEL: z.string().default("deepseek-chat"),
	AI_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),

	RESEND_API_KEY: optional,
	EMAIL_FROM: z.string().default("Postscript <onboarding@resend.dev>"),
	/** Dev/test only: also write every outgoing email as JSON into this folder. */
	EMAIL_OUTBOX_DIR: optional,

	POLAR_ACCESS_TOKEN: optional,
	POLAR_WEBHOOK_SECRET: optional,
	POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
	POLAR_PRODUCT_PRO_MONTHLY: optional,
	POLAR_PRODUCT_PRO_YEARLY: optional,
	POLAR_PRODUCT_TEAM_MONTHLY: optional,
	POLAR_PRODUCT_TEAM_YEARLY: optional,

	/** Birr payments: display conversion and alternate methods for Ethiopia. */
	USD_TO_ETB: optionalNumber(167),
	PAYMENT_POLAR_ENABLED: optionalBool("true"),
	PAYMENT_CHAPA_ENABLED: optionalBool("false"),
	PAYMENT_TELEBIRR_ENABLED: optionalBool("false"),
	PAYMENT_MANUAL_ENABLED: optionalBool("false"),

	CHAPA_SECRET_KEY: optional,
	CHAPA_WEBHOOK_SECRET: optional,

	TELEBIRR_MERCHANT_NUMBER: optional,
	TELEBIRR_MERCHANT_NAME: optional,
	TELEBIRR_RELAY_URL: optional,
	TELEBIRR_RELAY_TOKEN: optional,
	TELEBIRR_RECEIPT_BASE: z.string().url().default("https://transactioninfo.ethiotelecom.et/receipt/"),
	TELEBIRR_PAY_INSTRUCTIONS: z
		.string()
		.default("Pay the amount shown to the Telebirr number above. After you pay, enter the transaction id from your Telebirr receipt below."),

	/** Local disk path for manual payment proof uploads (a docker volume, not Postgres). */
	PAYMENT_PROOFS_DIR: z.string().default("/data/payment-proofs"),

	/** Requests per minute per IP on auth endpoints. */
	AUTH_RATE_LIMIT: z.coerce.number().default(20),
	/** Minutes between scheduled incremental syncs. */
	SYNC_INTERVAL_MINUTES: z.coerce.number().default(10),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
	if (!cached) {
		const parsed = schema.safeParse(process.env);
		if (!parsed.success) {
			const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
			throw new Error(`Invalid environment:\n  ${issues.join("\n  ")}`);
		}
		cached = parsed.data;
	}
	return cached;
}

/** Test hook: drop the cache so a test can change process.env. */
export function resetEnvCache(): void {
	cached = undefined;
}

export const features = {
	google: () => Boolean(setting("GOOGLE_CLIENT_ID") && setting("GOOGLE_CLIENT_SECRET")),
	gmail: () => Boolean(setting("GOOGLE_CLIENT_ID") && setting("GOOGLE_CLIENT_SECRET")),
	ai: () => Boolean(setting("AI_API_KEY")),
	email: () => Boolean(setting("RESEND_API_KEY")),
	billing: () => Boolean(setting("POLAR_ACCESS_TOKEN") && setting("POLAR_WEBHOOK_SECRET")),
};

export function googleRedirectUri(): string {
	return env().GOOGLE_REDIRECT_URI ?? `${env().API_URL}/api/auth/google/callback`;
}

export function gmailRedirectUri(): string {
	return env().GMAIL_CONNECT_REDIRECT_URI ?? `${env().API_URL}/api/mailbox/google/callback`;
}

export function platformAdmins(): string[] {
	return env()
		.PLATFORM_ADMIN_EMAILS.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
}

export function isSecureCookies(): boolean {
	return env().API_URL.startsWith("https://");
}

const truthy = (v: string | undefined) => v === "true" || v === "1";

/** A payment method is usable when its toggle is on AND it has the config it needs. */
export const paymentMethods = {
	polar: () => truthy(setting("PAYMENT_POLAR_ENABLED")) && features.billing(),
	chapa: () => truthy(setting("PAYMENT_CHAPA_ENABLED")) && Boolean(setting("CHAPA_SECRET_KEY") && setting("CHAPA_WEBHOOK_SECRET")),
	telebirr: () =>
		truthy(setting("PAYMENT_TELEBIRR_ENABLED")) &&
		Boolean(setting("TELEBIRR_MERCHANT_NUMBER") && setting("TELEBIRR_RELAY_URL") && setting("TELEBIRR_RELAY_TOKEN")),
	manual: () => truthy(setting("PAYMENT_MANUAL_ENABLED")),
};

export function usdToEtb(): number {
	const override = setting("USD_TO_ETB");
	const n = override ? Number(override) : env().USD_TO_ETB;
	return Number.isFinite(n) && n > 0 ? n : env().USD_TO_ETB;
}
