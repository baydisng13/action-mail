import { Inject, Injectable } from "@nestjs/common";
import type { PaymentMethod, PaymentRow, PlanId } from "@postscript/types";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { BillingService } from "../billing/billing.service";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { env } from "../config/env";
import { DB, type Db } from "../db/db";
import { organizations, payments, subscriptions, users } from "../db/schema";

@Injectable()
export class PaymentsService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly billing: BillingService,
	) {}

	/** Create the pending payment row every method starts from. */
	async createPending(args: {
		organizationId: string;
		userId: string;
		method: PaymentMethod;
		plan: PlanId;
		periodMonths: number;
		amountMinor: number;
		currency: string;
		note?: string;
		proofFileKey?: string;
	}) {
		const [row] = await this.db
			.insert(payments)
			.values({
				organizationId: args.organizationId,
				userId: args.userId,
				method: args.method,
				plan: args.plan,
				periodMonths: args.periodMonths,
				amountMinor: args.amountMinor,
				currency: args.currency,
				note: args.note,
				proofFileKey: args.proofFileKey,
			})
			.returning();
		return row;
	}

	/**
	 * Prepaid, non-renewing "subscription" row so the existing plan-resolver
	 * logic (resolvePlan/isEntitled) just works: status "canceled" with a
	 * future currentPeriodEnd is entitled until that date, then naturally
	 * expires with no extra bookkeeping.
	 */
	async activate(paymentId: string): Promise<void> {
		const [p] = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
		if (!p) return;
		const periodEnd = new Date();
		periodEnd.setUTCMonth(periodEnd.getUTCMonth() + p.periodMonths);
		const syntheticId = `${p.method}_${p.id}`;
		const values = {
			organizationId: p.organizationId,
			polarSubscriptionId: syntheticId,
			polarCustomerId: null,
			productId: null,
			plan: p.plan,
			interval: null,
			status: "canceled" as const,
			seats: 1,
			amountCents: p.amountMinor,
			currency: p.currency,
			currentPeriodEnd: periodEnd,
			cancelAtPeriodEnd: true,
			endedAt: null,
			sourceUpdatedAt: new Date(),
		};
		await this.db.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.polarSubscriptionId, set: values });
		await this.db.update(payments).set({ status: "paid" }).where(eq(payments.id, paymentId));
		await this.billing.recomputePlan(p.organizationId);
		log.info("payments.activated", { paymentId, method: p.method, orgId: p.organizationId, plan: p.plan, periodMonths: p.periodMonths });
	}

	async fail(paymentId: string, note: string): Promise<void> {
		await this.db.update(payments).set({ status: "failed", note }).where(eq(payments.id, paymentId));
	}

	async list(filter: { status?: string; method?: string }): Promise<PaymentRow[]> {
		const conds = [];
		if (filter.status) conds.push(eq(payments.status, filter.status as "pending"));
		if (filter.method) conds.push(eq(payments.method, filter.method as "chapa"));
		const rows = await this.db
			.select({ payment: payments, orgName: organizations.name, userEmail: users.email })
			.from(payments)
			.innerJoin(organizations, eq(organizations.id, payments.organizationId))
			.leftJoin(users, eq(users.id, payments.userId))
			.where(conds.length ? and(...conds) : undefined)
			.orderBy(desc(payments.createdAt))
			.limit(300);
		return rows.map((r) => ({
			id: r.payment.id,
			organizationId: r.payment.organizationId,
			organizationName: r.orgName,
			userEmail: r.userEmail ?? null,
			method: r.payment.method,
			status: r.payment.status,
			plan: r.payment.plan,
			periodMonths: r.payment.periodMonths,
			amountMinor: r.payment.amountMinor,
			currency: r.payment.currency,
			externalRef: r.payment.externalRef,
			note: r.payment.note,
			hasProof: Boolean(r.payment.proofFileKey),
			decidedBy: r.payment.decidedBy,
			decidedAt: r.payment.decidedAt?.toISOString() ?? null,
			createdAt: r.payment.createdAt.toISOString(),
		}));
	}

	/** Admin approves or rejects a manual proof payment. */
	async decide(paymentId: string, approve: boolean, adminEmail: string): Promise<void> {
		const [p] = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
		if (!p) throw new ApiError(404, "Payment not found", "not_found");
		if (p.method !== "manual") throw new ApiError(400, "Only manual proof payments need a decision", "invalid_input");
		if (p.status !== "pending") throw new ApiError(400, "This payment was already decided", "invalid_input");
		await this.db.update(payments).set({ status: approve ? "paid" : "rejected", decidedBy: adminEmail, decidedAt: new Date() }).where(eq(payments.id, paymentId));
		if (approve) await this.activate(paymentId);
		log.info("payments.decided", { paymentId, approve, by: adminEmail });
	}

	async proofPath(paymentId: string): Promise<string | null> {
		const [p] = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
		if (!p?.proofFileKey) return null;
		return join(env().PAYMENT_PROOFS_DIR, p.proofFileKey);
	}

	/** Worker: proofs from decided (or very old pending) payments, past 90 days. */
	async cleanupOldProofs(): Promise<number> {
		const cutoff = new Date(Date.now() - 90 * 86400_000);
		const rows = await this.db
			.select()
			.from(payments)
			.where(and(eq(payments.method, "manual"), isNotNull(payments.proofFileKey)));
		let removed = 0;
		for (const p of rows) {
			if (!p.proofFileKey) continue;
			const decidedCutoff = p.decidedAt && p.decidedAt < cutoff;
			const staleUndecided = !p.decidedAt && p.createdAt < cutoff;
			if (!decidedCutoff && !staleUndecided) continue;
			try {
				await unlink(join(env().PAYMENT_PROOFS_DIR, p.proofFileKey));
			} catch {
				// already gone
			}
			await this.db.update(payments).set({ proofFileKey: null }).where(eq(payments.id, p.id));
			removed++;
		}
		return removed;
	}
}
