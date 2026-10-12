import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { SECRET_SETTING_KEYS, type SettingKey, type SettingSource } from "@postscript/types";
import { decryptPlatformSetting, encryptPlatformSetting } from "../common/crypto";
import { log } from "../common/logger";
import type { Db } from "../db/db";
import { platformSettings, settingsAuditLog } from "../db/schema";
import { env } from "./env";

export const SETTINGS_CHANGED_CHANNEL = "settings:changed";

const SECRET_KEYS = new Set<SettingKey>(SECRET_SETTING_KEYS);

let cache = new Map<SettingKey, string>();
let loaded = false;

/** Re-read every row from platform_settings into the in-memory cache. */
export async function loadSettings(db: Db): Promise<void> {
	const rows = await db.select().from(platformSettings);
	const next = new Map<SettingKey, string>();
	for (const row of rows) {
		if (row.value == null) continue;
		try {
			next.set(row.key as SettingKey, row.isSecret ? decryptPlatformSetting(row.value) : row.value);
		} catch (err) {
			log.error("settings.decrypt_failed", { key: row.key, err });
		}
	}
	cache = next;
	loaded = true;
}

export function isSettingsLoaded(): boolean {
	return loaded;
}

/** The ui override for this key, or undefined to fall back to the env var. */
export function settingOverride(key: SettingKey): string | undefined {
	return cache.get(key);
}

/** Effective value: ui override first, then the matching env var. */
export function setting(key: SettingKey): string | undefined {
	const override = cache.get(key);
	if (override !== undefined) return override || undefined;
	const raw = (env() as unknown as Record<string, unknown>)[key];
	return typeof raw === "string" && raw ? raw : undefined;
}

export function settingSource(key: SettingKey): SettingSource {
	if (cache.get(key)) return "ui";
	const raw = (env() as unknown as Record<string, unknown>)[key];
	return typeof raw === "string" && raw ? "env" : "unset";
}

/** Write (or clear, with value === null) one setting and record the audit entry. */
export async function writeSetting(db: Db, key: SettingKey, value: string | null, actorEmail: string): Promise<void> {
	const isSecret = SECRET_KEYS.has(key);
	await db.transaction(async (tx) => {
		if (!value) {
			await tx.delete(platformSettings).where(eq(platformSettings.key, key));
		} else {
			const stored = isSecret ? encryptPlatformSetting(value) : value;
			await tx
				.insert(platformSettings)
				.values({ key, value: stored, isSecret, updatedBy: actorEmail })
				.onConflictDoUpdate({
					target: platformSettings.key,
					set: { value: stored, isSecret, updatedBy: actorEmail, updatedAt: new Date() },
				});
		}
		await tx.insert(settingsAuditLog).values({ key, action: value ? "set" : "clear", actorEmail });
	});
	if (value) cache.set(key, value);
	else cache.delete(key);
}

let publisher: Redis | undefined;

/**
 * Wire the pub/sub side: `pub` publishes changes, `sub` is a dedicated
 * connection (subscribing puts a redis connection in subscriber-only mode,
 * so it must not be the same client BullMQ or anything else blocks on).
 */
export function attachSettingsRedis(pub: Redis, sub: Redis, db: Db): void {
	publisher = pub;
	sub.subscribe(SETTINGS_CHANGED_CHANNEL).catch((err) => log.error("settings.subscribe_failed", { err }));
	sub.on("message", (channel: string) => {
		if (channel !== SETTINGS_CHANGED_CHANNEL) return;
		loadSettings(db).catch((err) => log.error("settings.reload_failed", { err }));
	});
}

/** Tell every other replica (api + worker) to reload, so no restart is needed. */
export async function publishSettingsChanged(): Promise<void> {
	try {
		await publisher?.publish(SETTINGS_CHANGED_CHANNEL, "1");
	} catch (err) {
		log.error("settings.publish_failed", { err });
	}
}

/** Test hook: drop the cache between tests. */
export function resetSettingsCache(): void {
	cache = new Map();
	loaded = false;
	publisher = undefined;
}
