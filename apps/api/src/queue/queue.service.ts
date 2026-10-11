import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { log } from "../common/logger";
import { REDIS } from "../redis/redis.module";
import {
	type AiJob,
	type BillingJob,
	DEFAULT_JOB,
	type DraftJob,
	type EmailJob,
	jobId,
	type MailActionJob,
	QUEUES,
	type SendJob,
	type SyncJob,
} from "./queues";

/** Producer side of every queue. The worker process consumes them. */
@Injectable()
export class QueueService implements OnModuleDestroy {
	private readonly queues = new Map<string, Queue>();

	constructor(@Inject(REDIS) private readonly redis: Redis) {}

	queue(name: string): Queue {
		let q = this.queues.get(name);
		if (!q) {
			q = new Queue(name, { connection: this.redis, defaultJobOptions: DEFAULT_JOB });
			this.queues.set(name, q);
		}
		return q;
	}

	/**
	 * One backfill batch. The id carries the batch start and the chain step, so a
	 * double click dedupes while each step of a running chain gets a fresh id
	 * (a step that adds nothing, like an empty folder, must not reuse its own id).
	 */
	async backfill(mailboxId: string, fromCount: number, step = 0, delayMs = 0) {
		const data: SyncJob = { type: "backfill", mailboxId, step };
		await this.queue(QUEUES.sync).add("backfill", data, { jobId: jobId("backfill", mailboxId, fromCount, step), delay: delayMs });
	}

	async incremental(mailboxId: string) {
		const data: SyncJob = { type: "incremental", mailboxId };
		const bucket = Math.floor(Date.now() / 60_000);
		await this.queue(QUEUES.sync).add("incremental", data, { jobId: jobId("inc", mailboxId, bucket) });
	}

	async triage(organizationId: string, userId: string) {
		const data: AiJob = { type: "triage", organizationId, userId };
		const bucket = Math.floor(Date.now() / (5 * 60_000));
		await this.queue(QUEUES.ai).add("triage", data, { jobId: jobId("triage", organizationId, userId, bucket) });
	}

	async email(msg: EmailJob) {
		await this.queue(QUEUES.email).add("send", msg, { attempts: 5 });
	}

	async billingEvent(eventId: string) {
		const data: BillingJob = { eventId };
		await this.queue(QUEUES.billing).add("polar", data, { jobId: jobId("polar", eventId), attempts: 8 });
	}

	async mailAction(job: MailActionJob) {
		await this.queue(QUEUES.mailAction).add("action", job, { attempts: 5 });
	}

	/** Delayed send: the delay IS the undo window. */
	async send(outboxId: string, delayMs: number) {
		const data: SendJob = { outboxId };
		await this.queue(QUEUES.send).add("send", data, { jobId: jobId("send", outboxId), delay: delayMs, attempts: 4 });
	}

	async cancelSend(outboxId: string): Promise<boolean> {
		const job = await this.queue(QUEUES.send).getJob(jobId("send", outboxId));
		if (!job) return false;
		try {
			await job.remove();
			return true;
		} catch {
			return false;
		}
	}

	async draftSync(draftId: string, version: number) {
		const data: DraftJob = { draftId, version };
		await this.queue(QUEUES.draft).add("sync", data, { jobId: jobId("draft", draftId, version), delay: 1500, attempts: 4 });
	}

	async onModuleDestroy() {
		await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
	}

	/** Never let a Redis hiccup fail the user's request after the DB write. */
	async safe(what: string, fn: () => Promise<unknown>) {
		try {
			await fn();
		} catch (err) {
			log.error("queue.enqueue_failed", { what, err: err as Error });
		}
	}
}
