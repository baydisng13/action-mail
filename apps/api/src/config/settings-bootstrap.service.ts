import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Redis } from "ioredis";
import { DB, type Db } from "../db/db";
import { createRedis, REDIS } from "../redis/redis.module";
import { attachSettingsRedis, loadSettings } from "./settings.store";

/**
 * Loads platform_settings into the in-memory cache on boot, then keeps it
 * fresh via a dedicated Redis subscriber (so a save in the api reaches the
 * worker too, with no restart). Runs in both the api and the worker since
 * both import CoreModule.
 */
@Injectable()
export class SettingsBootstrapService implements OnModuleInit, OnModuleDestroy {
	private sub?: Redis;

	constructor(
		@Inject(DB) private readonly db: Db,
		@Inject(REDIS) private readonly redis: Redis,
	) {}

	async onModuleInit() {
		await loadSettings(this.db);
		this.sub = createRedis();
		attachSettingsRedis(this.redis, this.sub, this.db);
	}

	async onModuleDestroy() {
		await this.sub?.quit().catch(() => undefined);
	}
}
