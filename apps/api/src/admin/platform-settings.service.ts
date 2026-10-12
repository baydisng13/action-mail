import { Inject, Injectable } from "@nestjs/common";
import {
	type PlatformSettingsResponse,
	SETTING_GROUPS,
	type SettingGroupId,
	type SettingItem,
	type SettingKey,
	type SettingTestResult,
} from "@postscript/types";
import { maskSecret } from "../common/crypto";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { gmailRedirectUri, googleRedirectUri, env } from "../config/env";
import { aiConfig } from "../ai/provider";
import { polar } from "../billing/polar";
import { DB, type Db } from "../db/db";
import { publishSettingsChanged, setting, settingSource, writeSetting } from "../config/settings.store";

const SECRET_KEYS = new Set<SettingKey>(
	SETTING_GROUPS.flatMap((g) => g.fields.filter((f) => f.secret).map((f) => f.key)),
);

@Injectable()
export class PlatformSettingsService {
	constructor(@Inject(DB) private readonly db: Db) {}

	async get(): Promise<PlatformSettingsResponse> {
		const items: SettingItem[] = SETTING_GROUPS.flatMap((g) => g.fields).map((f) => {
			const source = settingSource(f.key);
			const value = setting(f.key);
			if (SECRET_KEYS.has(f.key)) {
				return { key: f.key, source, value: null, masked: value ? maskSecret(value) : null };
			}
			return { key: f.key, source, value: value ?? null, masked: null };
		});
		return {
			items,
			googleRedirectUris: [googleRedirectUri(), gmailRedirectUri()],
			polarWebhookUrl: `${env().API_URL}/api/billing/webhook`,
		};
	}

	async update(actorEmail: string, updates: Record<string, string>): Promise<PlatformSettingsResponse> {
		const validKeys = new Set(SETTING_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
		for (const key of Object.keys(updates)) {
			if (!validKeys.has(key as SettingKey)) throw new ApiError(400, `Unknown setting: ${key}`, "invalid_input");
		}
		for (const [key, value] of Object.entries(updates)) {
			await writeSetting(this.db, key as SettingKey, value === "" ? null : value, actorEmail);
		}
		await publishSettingsChanged();
		log.info("admin.settings_changed", { by: actorEmail, keys: Object.keys(updates) });
		return this.get();
	}

	async test(group: SettingGroupId, testAddress?: string): Promise<SettingTestResult> {
		try {
			if (group === "google") return await this.testGoogle();
			if (group === "ai") return await this.testAi();
			if (group === "email") return await this.testEmail(testAddress);
			if (group === "payments") return await this.testPolar();
			throw new ApiError(400, "Unknown group", "invalid_input");
		} catch (err) {
			if (err instanceof ApiError) return { ok: false, message: err.message };
			return { ok: false, message: err instanceof Error ? err.message : "Test failed" };
		}
	}

	private async testGoogle(): Promise<SettingTestResult> {
		const id = setting("GOOGLE_CLIENT_ID");
		const secret = setting("GOOGLE_CLIENT_SECRET");
		if (!id || !secret) return { ok: false, message: "Set the client ID and secret, then save, before testing." };
		if (!id.endsWith(".apps.googleusercontent.com")) {
			return { ok: false, message: "That does not look like a Google OAuth client ID. It should end with .apps.googleusercontent.com." };
		}
		const res = await fetch("https://accounts.google.com/.well-known/openid-configuration", { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return { ok: false, message: "Could not reach Google's discovery endpoint. Try again shortly." };
		return { ok: true, message: "Client ID looks valid and Google is reachable." };
	}

	private async testAi(): Promise<SettingTestResult> {
		const { apiKey, model, baseUrl } = aiConfig();
		if (!apiKey) return { ok: false, message: "Set the API key, then save, before testing." };
		const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
			method: "POST",
			headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
			body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false }),
			signal: AbortSignal.timeout(15000),
		});
		if (!res.ok) return { ok: false, message: `AI provider returned ${res.status}. Check the key, model and base URL.` };
		return { ok: true, message: `Connected to ${new URL(baseUrl).hostname} with model ${model}.` };
	}

	private async testEmail(testAddress?: string): Promise<SettingTestResult> {
		const key = setting("RESEND_API_KEY");
		if (!key) return { ok: false, message: "Set the API key, then save, before testing." };
		if (testAddress) {
			const from = setting("EMAIL_FROM") ?? env().EMAIL_FROM;
			const res = await fetch("https://api.resend.com/emails", {
				method: "POST",
				headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
				body: JSON.stringify({
					from,
					to: testAddress,
					subject: "Postscript test email",
					text: "This is a test email from your Postscript platform settings.",
				}),
				signal: AbortSignal.timeout(15000),
			});
			if (!res.ok) return { ok: false, message: `Resend returned ${res.status}. Check the key and from address.` };
			return { ok: true, message: `Test email sent to ${testAddress}.` };
		}
		const res = await fetch("https://api.resend.com/api-keys", {
			headers: { authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(8000),
		});
		if (res.status === 401 || res.status === 403) return { ok: false, message: "Resend rejected this API key." };
		if (!res.ok) return { ok: false, message: `Resend returned ${res.status}.` };
		return { ok: true, message: "The API key is valid. Enter an address above to send a test email." };
	}

	private async testPolar(): Promise<SettingTestResult> {
		const token = setting("POLAR_ACCESS_TOKEN");
		if (!token) return { ok: false, message: "Set the access token, then save, before testing." };
		const ids = [
			setting("POLAR_PRODUCT_PRO_MONTHLY"),
			setting("POLAR_PRODUCT_PRO_YEARLY"),
			setting("POLAR_PRODUCT_TEAM_MONTHLY"),
			setting("POLAR_PRODUCT_TEAM_YEARLY"),
		].filter((v): v is string => Boolean(v));
		let products: { id: string }[];
		try {
			const res = await polar().products.list({ limit: 100 });
			products = res.items;
		} catch (err) {
			return { ok: false, message: `Could not list products: ${err instanceof Error ? err.message : "unknown error"}` };
		}
		const found = new Set(products.map((p) => p.id));
		const missing = ids.filter((id) => !found.has(id));
		if (ids.length === 0) return { ok: true, message: "Token works, but no product IDs are set yet." };
		if (missing.length > 0) return { ok: false, message: `Token works, but ${missing.length} of ${ids.length} product IDs were not found.` };
		return { ok: true, message: `Token works and all ${ids.length} product IDs were found.` };
	}
}
