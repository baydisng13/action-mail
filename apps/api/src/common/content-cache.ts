import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module";
import { orgCipher } from "./crypto";

/** Hard ceiling for anything holding mail content. */
export const CONTENT_TTL_SEC = 60 * 60;

/**
 * Short-lived, encrypted store for mail content (bodies, compose drafts,
 * uploads, outgoing mail). Never Postgres, never disk. Keys are grouped by
 * org and mailbox so a disconnect or logout can drop them at once.
 *   c:<org>:<mailbox>:<kind>:<id>
 */
@Injectable()
export class ContentCache {
	constructor(@Inject(REDIS) private readonly redis: Redis) {}

	private key(orgId: string, mailboxId: string, kind: string, id: string) {
		return `c:${orgId}:${mailboxId}:${kind}:${id}`;
	}

	async put(orgId: string, mailboxId: string, kind: string, id: string, value: unknown, ttl = CONTENT_TTL_SEC) {
		const payload = orgCipher(orgId).enc(value);
		await this.redis.set(this.key(orgId, mailboxId, kind, id), payload, "EX", Math.min(ttl, CONTENT_TTL_SEC));
	}

	async get<T>(orgId: string, mailboxId: string, kind: string, id: string): Promise<T | null> {
		const raw = await this.redis.get(this.key(orgId, mailboxId, kind, id));
		return raw ? orgCipher(orgId).dec<T>(raw) : null;
	}

	async putBuffer(orgId: string, mailboxId: string, kind: string, id: string, value: Buffer, ttl = CONTENT_TTL_SEC) {
		const payload = orgCipher(orgId).encBuf(value);
		await this.redis.set(this.key(orgId, mailboxId, kind, id), payload, "EX", Math.min(ttl, CONTENT_TTL_SEC));
	}

	async getBuffer(orgId: string, mailboxId: string, kind: string, id: string): Promise<Buffer | null> {
		const raw = await this.redis.getBuffer(this.key(orgId, mailboxId, kind, id));
		return raw ? orgCipher(orgId).decBuf(raw) : null;
	}

	async del(orgId: string, mailboxId: string, kind: string, id: string) {
		await this.redis.del(this.key(orgId, mailboxId, kind, id));
	}

	/** Drop every cached item for a mailbox (disconnect, logout). */
	async purgeMailbox(orgId: string, mailboxId: string) {
		await this.purge(`c:${orgId}:${mailboxId}:*`);
	}

	async purgeOrg(orgId: string) {
		await this.purge(`c:${orgId}:*`);
	}

	private async purge(pattern: string) {
		let cursor = "0";
		do {
			const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 500);
			cursor = next;
			if (keys.length) await this.redis.del(...keys);
		} while (cursor !== "0");
	}
}
