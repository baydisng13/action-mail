import { Inject, Injectable } from "@nestjs/common";
import { type BillingSummary, type CheckoutInput, type PlanId, TEAM_MIN_SEATS } from "@postscript/types";
import { and, desc, eq } from "drizzle-orm";
import type { AuthCtx } from "../common/auth";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { env, features } from "../config/env";
import { DB, type Db } from "../db/db";
import { memberships, organizations, subscriptions, webhookEvents } from "../db/schema";
import { QueueService } from "../queue/queue.service";
import { isEntitled, resolvePlan } from "./plan-resolver";
import { availableIntervals, planForProduct, polar, productFor } from "./polar";

interface PolarSubscriptionData {
	id: string;
	status: string;
	amount?: number;
	currency?: string;
	recurring_interval?: string;
	current_period_end?: string | null;
	cancel_at_period_end?: boolean;
	ended_at?: string | null;
	modified_at?: string | null;
	created_at?: string;
	customer_id?: string;
	product_id: string;
	seats?: number | null;
	metadata?: Record<string, unknown>;
	customer?: { id?: string; external_id?: string | null };
}

/** Birr packs create synthetic subscription rows keyed `<method>_<paymentId>`. */
export function isSyntheticSub(polarSubscriptionId: string): boolean {
	return /^(chapa|telebirr|manual)_/.test(polarSubscriptionId);
}

@Injectable()
export class BillingService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly queues: QueueService,
	) {}

	async summary(ctx: AuthCtx): Promise<BillingSummary> {
		const [sub] = await this.db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.organizationId, ctx.orgId))
			.orderBy(desc(subscriptions.updatedAt))
			.limit(1);
		const resolved = resolvePlan(ctx.org, sub ? [sub] : []);
		const perSeatBilling = Boolean(sub && sub.plan === "team" && !isSyntheticSub(sub.polarSubscriptionId) && isEntitled(sub));
		return {
			configured: features.billing(),
			plan: ctx.org.plan,
			source: ctx.org.compPlan ? "comp" : resolved.source,
			perSeatBilling,
			subscription: sub
				? {
						status: sub.status,
						plan: sub.plan,
						interval: (sub.interval as "month" | "year" | null) ?? null,
						seats: sub.seats,
						currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
						cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
					}
				: null,
			canManage: ctx.role === "owner" || ctx.role === "admin",
			availableIntervals: { pro: availableIntervals("pro"), team: availableIntervals("team") },
		};
	}

	async checkout(ctx: AuthCtx, input: CheckoutInput): Promise<{ url: string }> {
		if (!features.billing()) throw new ApiError(503, "Billing is not configured yet", "billing_unconfigured");
		if (input.plan === "team" && ctx.org.isPersonal) {
			throw new ApiError(400, "Create a team workspace first, then pick the Team plan there.", "team_needs_org");
		}
		const productId = productFor(input.plan, input.interval);
		if (!productId) throw new ApiError(400, "That plan is not available yet", "plan_unavailable");
		const n = await this.db.$count(memberships, eq(memberships.organizationId, ctx.orgId));
		const seats = input.plan === "team" ? Math.max(input.seats ?? TEAM_MIN_SEATS, n, TEAM_MIN_SEATS) : undefined;
		try {
			const checkout = await polar().checkouts.create({
				products: [productId],
				external_customer_id: ctx.orgId,
				customer_email: ctx.email,
				metadata: { organization_id: ctx.orgId, plan: input.plan },
				success_url: `${env().APP_URL}/app/settings?tab=billing&checkout=success`,
				return_url: `${env().APP_URL}/app/settings?tab=billing`,
				...(seats ? { seats } : {}),
			});
			return { url: checkout.url };
		} catch (err) {
			log.error("billing.checkout_failed", { orgId: ctx.orgId, err: err as Error });
			throw new ApiError(502, "Could not start checkout. Please try again.", "checkout_failed");
		}
	}

	async portal(ctx: AuthCtx): Promise<{ url: string }> {
		if (!features.billing()) throw new ApiError(503, "Billing is not configured yet", "billing_unconfigured");
		try {
			const s = await polar().customerSessions.create({
				external_customer_id: ctx.orgId,
				return_url: `${env().APP_URL}/app/settings?tab=billing`,
			});
			return { url: s.customer_portal_url };
		} catch (err) {
			log.warn("billing.portal_failed", { orgId: ctx.orgId, err: err as Error });
			throw new ApiError(400, "No billing account yet. Upgrade first.", "no_customer");
		}
	}

	/** Store a verified webhook (idempotent by delivery id) and queue it. */
	async acceptWebhook(id: string, type: string, payload: unknown): Promise<{ duplicate: boolean }> {
		const rows = await this.db
			.insert(webhookEvents)
			.values({ id, type, payload: payload as object })
			.onConflictDoNothing({ target: webhookEvents.id })
			.returning({ id: webhookEvents.id });
		if (!rows.length) {
			const [e] = await this.db.select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1);
			if (e?.processedAt) return { duplicate: true };
		}
		await this.queues.billingEvent(id);
		return { duplicate: rows.length === 0 };
	}

	/** Worker: apply one stored webhook event. Safe to run twice. */
	async processEvent(eventId: string): Promise<void> {
		const [e] = await this.db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).limit(1);
		if (!e || e.processedAt) return;
		await this.db.update(webhookEvents).set({ attempts: e.attempts + 1 }).where(eq(webhookEvents.id, e.id));
		try {
			const payload = e.payload as { type: string; data: Record<string, unknown> };
			if (payload.type.startsWith("subscription.")) {
				await this.applySubscription(payload.data as unknown as PolarSubscriptionData);
			} else if (payload.type === "order.paid") {
				const subId = payload.data.subscription_id as string | null;
				if (subId && features.billing()) {
					const sub = await polar().subscriptions.get(subId);
					await this.applySubscription(sub as unknown as PolarSubscriptionData);
				}
			}
			await this.db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, e.id));
		} catch (err) {
			await this.db
				.update(webhookEvents)
				.set({ error: err instanceof Error ? err.message.slice(0, 500) : "failed" })
				.where(eq(webhookEvents.id, e.id));
			throw err;
		}
	}

	async applySubscription(data: PolarSubscriptionData): Promise<void> {
		const orgId = (data.metadata?.organization_id as string | undefined) ?? data.customer?.external_id ?? null;
		if (!orgId) {
			log.warn("billing.subscription_without_org", { subscriptionId: data.id });
			return;
		}
		const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
		if (!org) {
			log.warn("billing.unknown_org", { subscriptionId: data.id, orgId });
			return;
		}
		const mapped = planForProduct(data.product_id);
		const plan: PlanId = mapped?.plan ?? ((data.metadata?.plan as PlanId | undefined) === "team" ? "team" : "pro");
		const modifiedAt = data.modified_at ? new Date(data.modified_at) : data.created_at ? new Date(data.created_at) : new Date();

		const [existing] = await this.db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.polarSubscriptionId, data.id))
			.limit(1);
		// Webhooks can arrive out of order: never let an older state overwrite a newer one.
		if (existing?.sourceUpdatedAt && existing.sourceUpdatedAt > modifiedAt) return;

		const values = {
			organizationId: org.id,
			polarSubscriptionId: data.id,
			polarCustomerId: data.customer_id ?? data.customer?.id ?? null,
			productId: data.product_id,
			plan,
			interval: data.recurring_interval ?? mapped?.interval ?? null,
			status: data.status,
			seats: Math.max(1, data.seats ?? 1),
			amountCents: data.amount ?? 0,
			currency: data.currency ?? "usd",
			currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
			cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
			endedAt: data.ended_at ? new Date(data.ended_at) : null,
			sourceUpdatedAt: modifiedAt,
		};
		await this.db
			.insert(subscriptions)
			.values(values)
			.onConflictDoUpdate({ target: subscriptions.polarSubscriptionId, set: values });
		if (values.polarCustomerId && !org.polarCustomerId) {
			await this.db.update(organizations).set({ polarCustomerId: values.polarCustomerId }).where(eq(organizations.id, org.id));
		}
		await this.recomputePlan(org.id);
	}

	/**
	 * The org's live, entitled USD (Polar) Team subscription, or null. Birr packs
	 * (synthetic rows) and non-Team / expired subs are excluded. Pure DB read, so
	 * it also drives the invite seat policy, not just seat syncing.
	 */
	async activePolarTeamSub(orgId: string) {
		const subs = await this.db.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId));
		return subs.find((s) => s.plan === "team" && !isSyntheticSub(s.polarSubscriptionId) && isEntitled(s)) ?? null;
	}

	/**
	 * Slack-style live seats: set the Polar quantity to the current membership
	 * count (owner + accepted members), never below the Team minimum, and let
	 * Polar prorate. Safe to call on every membership change:
	 *  - skips birr/synthetic packs and orgs with no active Polar Team sub;
	 *  - idempotent — only calls Polar when the quantity actually differs;
	 *  - writes the new seats locally with a fresh source timestamp, so the
	 *    inbound webhook for our own change reconciles instead of fighting us
	 *    (the out-of-order guard in applySubscription drops a stale one).
	 */
	async syncSeats(orgId: string): Promise<void> {
		if (!features.billing()) return;
		const target = await this.activePolarTeamSub(orgId);
		if (!target) return;
		const liveSeats = await this.db.$count(memberships, eq(memberships.organizationId, orgId));
		const desired = Math.max(TEAM_MIN_SEATS, liveSeats);
		if (desired === target.seats) return;
		try {
			await polar().subscriptions.update(target.polarSubscriptionId, { seats: desired, proration_behavior: "prorate" });
		} catch (err) {
			log.error("billing.sync_seats_failed", { orgId, subscriptionId: target.polarSubscriptionId, err: err as Error });
			return;
		}
		await this.db
			.update(subscriptions)
			.set({ seats: desired, sourceUpdatedAt: new Date() })
			.where(eq(subscriptions.id, target.id));
		await this.recomputePlan(orgId);
		log.info("billing.seats_synced", { orgId, from: target.seats, to: desired });
	}

	/** Recompute and store the org's effective plan + seats. */
	async recomputePlan(orgId: string): Promise<{ plan: PlanId; seats: number }> {
		const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
		if (!org) return { plan: "free", seats: 1 };
		const subs = await this.db.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId));
		const r = resolvePlan(org, subs);
		if (r.plan !== org.plan || r.seats !== org.seats) {
			await this.db.update(organizations).set({ plan: r.plan, seats: r.seats }).where(and(eq(organizations.id, orgId)));
			log.info("billing.plan_changed", { orgId, from: org.plan, to: r.plan, seats: r.seats, source: r.source });
		}
		return r;
	}
}
