import { z } from "zod";

/**
 * Third-party config the platform owner can set from the admin UI instead of
 * Coolify env vars. A key with no row in platform_settings falls back to its
 * env var; see apps/api/src/config/settings.store.ts.
 */
export type SettingKey =
	| "GOOGLE_CLIENT_ID"
	| "GOOGLE_CLIENT_SECRET"
	| "AI_API_KEY"
	| "AI_MODEL"
	| "AI_BASE_URL"
	| "RESEND_API_KEY"
	| "EMAIL_FROM"
	| "POLAR_ACCESS_TOKEN"
	| "POLAR_WEBHOOK_SECRET"
	| "POLAR_SERVER"
	| "POLAR_PRODUCT_PRO_MONTHLY"
	| "POLAR_PRODUCT_PRO_YEARLY"
	| "POLAR_PRODUCT_TEAM_MONTHLY"
	| "POLAR_PRODUCT_TEAM_YEARLY";

/** Never shown in full once saved; GET returns a short mask instead. */
export const SECRET_SETTING_KEYS: readonly SettingKey[] = [
	"GOOGLE_CLIENT_SECRET",
	"AI_API_KEY",
	"RESEND_API_KEY",
	"POLAR_ACCESS_TOKEN",
	"POLAR_WEBHOOK_SECRET",
];

export type SettingGroupId = "google" | "ai" | "email" | "payments";

export interface SettingField {
	key: SettingKey;
	label: string;
	placeholder?: string;
	secret: boolean;
}

export interface SettingGroup {
	id: SettingGroupId;
	label: string;
	help: string;
	linkLabel: string;
	linkUrl: string;
	fields: SettingField[];
	/** True once every field required for the group to work is set (ui or env). */
	requiredKeys: SettingKey[];
}

export const SETTING_GROUPS: SettingGroup[] = [
	{
		id: "google",
		label: "Google",
		help: "Lets people sign in with Google and connect a Gmail mailbox. Create an OAuth client in Google Cloud Console and paste the redirect URIs shown below into it.",
		linkLabel: "Google Cloud Console credentials",
		linkUrl: "https://console.cloud.google.com/apis/credentials",
		fields: [
			{ key: "GOOGLE_CLIENT_ID", label: "Client ID", placeholder: "xxxxx.apps.googleusercontent.com", secret: false },
			{ key: "GOOGLE_CLIENT_SECRET", label: "Client secret", secret: true },
		],
		requiredKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
	},
	{
		id: "ai",
		label: "AI",
		help: "Powers mail summaries and suggested actions. Defaults match DeepSeek, an OpenAI-compatible provider.",
		linkLabel: "DeepSeek API keys",
		linkUrl: "https://platform.deepseek.com/api_keys",
		fields: [
			{ key: "AI_API_KEY", label: "API key", secret: true },
			{ key: "AI_MODEL", label: "Model", placeholder: "deepseek-chat", secret: false },
			{ key: "AI_BASE_URL", label: "Base URL", placeholder: "https://api.deepseek.com/v1", secret: false },
		],
		requiredKeys: ["AI_API_KEY"],
	},
	{
		id: "email",
		label: "Email",
		help: "Sends verification, password reset and invite emails through Resend.",
		linkLabel: "Resend API keys",
		linkUrl: "https://resend.com/api-keys",
		fields: [
			{ key: "RESEND_API_KEY", label: "API key", secret: true },
			{ key: "EMAIL_FROM", label: "From address", placeholder: "Postscript <hello@yourdomain.com>", secret: false },
		],
		requiredKeys: ["RESEND_API_KEY"],
	},
	{
		id: "payments",
		label: "Payments (Polar)",
		help: "Subscriptions and billing. Create a webhook in Polar and paste the URL shown below into it.",
		linkLabel: "Polar dashboard",
		linkUrl: "https://polar.sh/dashboard",
		fields: [
			{ key: "POLAR_ACCESS_TOKEN", label: "Access token", secret: true },
			{ key: "POLAR_WEBHOOK_SECRET", label: "Webhook secret", secret: true },
			{ key: "POLAR_SERVER", label: "Environment", placeholder: "sandbox or production", secret: false },
			{ key: "POLAR_PRODUCT_PRO_MONTHLY", label: "Pro, monthly product id", secret: false },
			{ key: "POLAR_PRODUCT_PRO_YEARLY", label: "Pro, yearly product id", secret: false },
			{ key: "POLAR_PRODUCT_TEAM_MONTHLY", label: "Team, monthly product id", secret: false },
			{ key: "POLAR_PRODUCT_TEAM_YEARLY", label: "Team, yearly product id", secret: false },
		],
		requiredKeys: ["POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET"],
	},
];

export const SETTING_KEYS: SettingKey[] = SETTING_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export type SettingSource = "ui" | "env" | "unset";

export interface SettingItem {
	key: SettingKey;
	source: SettingSource;
	/** Present for non-secret keys that have a value (ui or env). */
	value: string | null;
	/** Present for secret keys that have a value (ui or env), e.g. "sk-...a1b2". */
	masked: string | null;
}

export interface PlatformSettingsResponse {
	items: SettingItem[];
	/** Paste these into the Google OAuth client, built from API_URL. */
	googleRedirectUris: string[];
	/** Paste this into the Polar webhook, built from API_URL. */
	polarWebhookUrl: string;
}

/** key -> new value. Empty string clears the ui override (falls back to env). */
export const settingsUpdateSchema = z.object({
	updates: z.record(z.string(), z.string().max(4000)),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

export const settingsTestEmailSchema = z.object({
	testAddress: z.string().email().optional(),
});

export interface SettingTestResult {
	ok: boolean;
	message: string;
}
