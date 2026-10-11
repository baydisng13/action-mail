import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { type Job, Worker } from "bullmq";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { AiService } from "../ai/ai.service";
import { BillingService } from "../billing/billing.service";
import { LimitsService } from "../billing/limits.service";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { env } from "../config/env";
import { DB, type Db } from "../db/db";
import { drafts, mailboxes, organizations, outbox, refreshTokens, usageCounters, verificationTokens, webhookEvents } from "../db/schema";
import { deliverEmail } from "../email/email.service";
import { ActionsService } from "../mail/actions.service";
import { ComposeService } from "../mail/compose.service";
import { SyncService } from "../mail/sync.service";
import { createRedis, REDIS } from "../redis/redis.module";
import { QueueService } from "../queue/queue.service";
import {
	type AiJob,
	type BillingJob,
	type DraftJob,
	type EmailJob,
	type MailActionJob,
	type MaintenanceJob,
	QUEUES,
	type SendJob,
	type SyncJob,
} from "../queue/queues";

/** Consumes every queue. Runs as its own process (same image as the api). */
@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
	private workers: Worker[] = [];

	constructor(
		@Inject(DB) private readonly db: Db,
		@Inject(REDIS) private readonly redis: Redis,
		private readonly queues: QueueService,
		private readonly sync: SyncService,
		private readonly actions: ActionsService,
		private readonly compose: ComposeService,
		private readonly billing: BillingService,
		private readonly ai: AiService,
		private readonly limits: LimitsService,
	) {}

	private start<T>(name: string, concurrency: number, fn: (job: Job<T>) => Promise<unknown>) {
		const w = new Worker<T>(
			name,
			async (job) => {
				const started = Date.now();
				try {
					const r = await fn(job);
					log.info("job.done", { queue: name, job: job.name, id: job.id, ms: Date.now() - started });
					return r;
				} catch (err) {
					log.warn("job.failed", { queue: name, job: job.name, id: job.id, attempt: job.attemptsMade + 1, err: err as Error });
					throw err;
				}
			},
			{ connection: createRedis(), concurrency },
		);
		w.on("error", (err) => log.error("worker.error", { queue: name, err }));
		this.workers.push(w);
	}

	async onApplicationBootstrap() {
		this.start<SyncJob>(QUEUES.sync, 4, async (job) => {
			const { mailboxId, type } = job.data;
			// One sync at a time per mailbox, across workers (IMAP cursors are per folder).
			const lock = `lock:sync:${mailboxId}`;
			const token = String(job.id);
			if (!(await this.redis.set(lock, token, "EX", 300, "NX"))) {
				// A chain step must not be lost behind a quick incremental: try again shortly.
				if (type === "backfill" && (job.data.step ?? 0) > 0) {
					const m = await this.db.select({ n: mailboxes.syncedCount }).from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
					if (m[0]) await this.queues.backfill(mailboxId, m[0].n, (job.data.step ?? 0) + 1, 3000);
				}
				return { skipped: "busy" };
			}
			let next: { syncedCount: number } | null = null;
			try {
				if (type === "backfill") {
					const r = await this.sync.backfillStep(mailboxId);
					if (r.hasMore) next = { syncedCount: r.syncedCount };
					return r;
				}
				const r = await this.sync.incremental(mailboxId);
				if (r.added > 0) await this.maybeTriage(mailboxId);
				return r;
			} finally {
				if ((await this.redis.get(lock)) === token) await this.redis.del(lock);
				// Queue the next batch only after the lock is free, or it would skip itself.
				if (next) await this.queues.backfill(mailboxId, next.syncedCount, (job.data.step ?? 0) + 1);
			}
		});
		this.start<MailActionJob>(QUEUES.mailAction, 4, (job) => this.actions.execute(job.data));
		this.start<SendJob>(QUEUES.send, 4, (job) =>
			this.compose.deliver(job.data.outboxId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1)),
		);
		this.start<DraftJob>(QUEUES.draft, 2, (job) => this.compose.syncDraft(job.data.draftId));
		this.start<EmailJob>(QUEUES.email, 2, (job) => deliverEmail(job.data));
		this.start<BillingJob>(QUEUES.billing, 2, (job) => this.billing.processEvent(job.data.eventId));
		this.start<AiJob>(QUEUES.ai, 2, async (job) => {
			try {
				return await this.ai.scanTodos({ orgId: job.data.organizationId, userId: job.data.userId }, 10);
			} catch (err) {
				if (err instanceof ApiError && (err.code === "ai_limit" || err.code === "ai_unconfigured")) return { skipped: err.code };
				throw err;
			}
		});
		this.start<MaintenanceJob>(QUEUES.maintenance, 1, (job) => this.maintenance(job.data));

		// Repeatable jobs (deduped by BullMQ across restarts and replicas).
		const m = this.queues.queue(QUEUES.maintenance);
		await m.upsertJobScheduler("sync-all", { every: env().SYNC_INTERVAL_MINUTES * 60_000 }, { name: "sync-all", data: { type: "sync-all" } });
		await m.upsertJobScheduler("cleanup", { pattern: "17 3 * * *" }, { name: "cleanup", data: { type: "cleanup" } });
		await m.upsertJobScheduler("unsnooze", { every: 5 * 60_000 }, { name: "unsnooze", data: { type: "unsnooze" } });
		log.info("worker.started", { queues: Object.values(QUEUES) });
	}

	/** Paid plans: AI triage of new mail into to-dos. */
	private async maybeTriage(mailboxId: string) {
		const [row] = await this.db
			.select({ org: organizations, userId: mailboxes.userId })
			.from(mailboxes)
			.innerJoin(organizations, eq(organizations.id, mailboxes.organizationId))
			.where(eq(mailboxes.id, mailboxId))
			.limit(1);
		if (!row || row.org.suspendedAt || !this.limits.limitsFor(row.org).autoTriage) return;
		await this.queues.safe("triage", () => this.queues.triage(row.org.id, row.userId));
	}

	private async maintenance(job: MaintenanceJob) {
		if (job.type === "sync-all") {
			const rows = await this.db
				.select({ id: mailboxes.id, status: mailboxes.status, syncedCount: mailboxes.syncedCount })
				.from(mailboxes)
				.innerJoin(organizations, eq(organizations.id, mailboxes.organizationId))
				.where(sql`${organizations.suspendedAt} is null`);
			for (const r of rows) {
				if (r.status === "ready" || r.status === "error") await this.queues.incremental(r.id);
				else await this.queues.backfill(r.id, r.syncedCount);
			}
			return { mailboxes: rows.length };
		}
		if (job.type === "unsnooze") {
			// Snoozed threads simply reappear in the inbox when the time passes;
			// clear the stamp so they sort and show as normal.
			const r = await this.db.execute(sql`update threads set snoozed_until = null where snoozed_until <= now()`);
			return { cleared: r.count };
		}
		// Daily cleanup: old tokens, finished outbox rows, stale drafts, old counters and events.
		const day = 86400_000;
		await this.db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
		await this.db.delete(verificationTokens).where(lt(verificationTokens.expiresAt, new Date(Date.now() - day)));
		await this.db.delete(outbox).where(and(inArray(outbox.status, ["sent", "canceled", "failed"]), lt(outbox.createdAt, new Date(Date.now() - 7 * day))));
		await this.db.delete(drafts).where(and(eq(drafts.syncedVersion, 0), lt(drafts.updatedAt, new Date(Date.now() - day))));
		await this.db.delete(webhookEvents).where(lt(webhookEvents.createdAt, new Date(Date.now() - 90 * day)));
		const cutoff = new Date();
		cutoff.setUTCMonth(cutoff.getUTCMonth() - 13);
		await this.db.delete(usageCounters).where(lt(usageCounters.period, cutoff.toISOString().slice(0, 7)));
		return { ok: true };
	}

	async onApplicationShutdown() {
		await Promise.all(this.workers.map((w) => w.close().catch(() => undefined)));
	}
}
