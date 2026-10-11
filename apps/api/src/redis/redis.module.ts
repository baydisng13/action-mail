import { Global, Inject, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import IORedis, { type Redis } from "ioredis";
import { env } from "../config/env";

export const REDIS = Symbol("REDIS");

export function createRedis(): Redis {
	// BullMQ requires maxRetriesPerRequest: null on connections it blocks on.
	return new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
}

@Injectable()
class RedisCloser implements OnModuleDestroy {
	constructor(@Inject(REDIS) private readonly redis: Redis) {}
	async onModuleDestroy() {
		await this.redis.quit().catch(() => undefined);
	}
}

@Global()
@Module({
	providers: [{ provide: REDIS, useFactory: createRedis }, RedisCloser],
	exports: [REDIS],
})
export class RedisModule {}
