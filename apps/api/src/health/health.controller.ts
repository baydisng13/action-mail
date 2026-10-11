import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { ConfigResponse } from "@postscript/types";
import { sql } from "drizzle-orm";
import type { Response } from "express";
import type { Redis } from "ioredis";
import { aiProviderName } from "../ai/provider";
import { Public } from "../common/auth";
import { features } from "../config/env";
import { DB, type Db } from "../db/db";
import { UNDO_SECONDS } from "../mail/compose.service";
import { REDIS } from "../redis/redis.module";

@Public()
@Controller()
export class HealthController {
	constructor(
		@Inject(DB) private readonly db: Db,
		@Inject(REDIS) private readonly redis: Redis,
	) {}

	@Get("health")
	async health(@Res() res: Response) {
		const check = async (fn: () => Promise<unknown>) => {
			try {
				await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000))]);
				return "ok";
			} catch {
				return "down";
			}
		};
		const [db, redis] = await Promise.all([check(() => this.db.execute(sql`select 1`)), check(() => this.redis.ping())]);
		const ok = db === "ok" && redis === "ok";
		res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", db, redis, time: new Date().toISOString() });
	}

	@Get("config")
	config(): ConfigResponse {
		return {
			features: { google: features.google(), gmail: features.gmail(), ai: features.ai(), email: features.email(), billing: features.billing() },
			aiProvider: aiProviderName(),
			undoSendSeconds: UNDO_SECONDS,
		};
	}
}
