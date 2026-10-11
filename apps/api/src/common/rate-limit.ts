import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Redis } from "ioredis";
import { env } from "../config/env";
import { REDIS } from "../redis/redis.module";
import { ApiError } from "./errors";

const RATE = "ps:rate";

/** Fixed-window limit per client IP, shared across replicas via Redis. */
export const RateLimit = (bucket: string, perMinute?: number) => SetMetadata(RATE, { bucket, perMinute });

export function clientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
	const fwd = req.headers["x-forwarded-for"];
	const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
	return first || req.ip || "unknown";
}

@Injectable()
export class RateLimitGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		@Inject(REDIS) private readonly redis: Redis,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const cfg = this.reflector.getAllAndOverride<{ bucket: string; perMinute?: number } | undefined>(RATE, [
			context.getHandler(),
			context.getClass(),
		]);
		if (!cfg) return true;
		const limit = cfg.perMinute ?? env().AUTH_RATE_LIMIT;
		const req = context.switchToHttp().getRequest();
		const window = Math.floor(Date.now() / 60_000);
		const key = `rl:${cfg.bucket}:${clientIp(req)}:${window}`;
		try {
			const n = await this.redis.incr(key);
			if (n === 1) await this.redis.expire(key, 70);
			if (n > limit) throw new ApiError(429, "Too many attempts. Please wait a minute and try again.", "rate_limited");
		} catch (err) {
			if (err instanceof ApiError) throw err;
			// Redis down: fail open rather than lock everyone out of sign-in.
		}
		return true;
	}
}
