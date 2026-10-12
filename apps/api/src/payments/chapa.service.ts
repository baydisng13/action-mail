import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { normalizeSeats, PLANS, type PlanId } from "@postscript/types";
import { eq } from "drizzle-orm";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { env, usdToEtb } from "../config/env";
import { setting } from "../config/settings.store";
import { DB, type Db } from "../db/db";
import { organizations, payments, users, webhookEvents } from "../db/schema";
import { PaymentsService } from "./payments.service";

const CHAPA_BASE = "https://api.chapa.co/v1";

/** Chapa (card and mobile money, ETB) — hosted checkout, HMAC-verified webhook. */
@Injectable()
export class ChapaService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly payments: PaymentsService,
	) {}

	private secretKey(): string {
		const key = setting("CHAPA_SECRET_KEY");
		if (!key) throw new ApiError(503, "Chapa is not configured yet", "chapa_unconfigured");
		return key;
	}

	priceEtb(plan: Exclude<PlanId, "free">, periodMonths: number, seats = 1): number {
		const billedSeats = PLANS[plan].perSeat ? Math.max(1, seats) : 1;
		return Math.round(PLANS[plan].priceMonthly * periodMonths * billedSeats * usdToEtb());
	}

	async initialize(orgId: string, userId: string, email: string, plan: Exclude<PlanId, "free">, periodMonths: number, requestedSeats?: number): Promise<{ checkoutUrl: string }> {
		const seats = normalizeSeats(plan, requestedSeats ?? 1);
		const amount = this.priceEtb(plan, periodMonths, seats);
		const row = await this.payments.createPending({
			organizationId: orgId,
			userId,
			method: "chapa",
			plan,
			periodMonths,
			seats,
			amountMinor: amount * 100,
			currency: "etb",
		});
		const txRef = `ps_${row.id}`;
		await this.db.update(payments).set({ externalRef: txRef }).where(eq(payments.id, row.id));
		const res = await fetch(`${CHAPA_BASE}/transaction/initialize`, {
			method: "POST",
			headers: { authorization: `Bearer ${this.secretKey()}`, "content-type": "application/json" },
			body: JSON.stringify({
				amount: String(amount),
				currency: "ETB",
				email,
				tx_ref: txRef,
				callback_url: `${env().API_URL}/api/payments/chapa/webhook`,
				return_url: `${env().APP_URL}/app/settings?tab=billing&chapa=${txRef}`,
				customization: { title: "Postscript", description: `${PLANS[plan].name} plan, ${seats} seat(s), ${periodMonths} month(s)` },
			}),
			signal: AbortSignal.timeout(15000),
		});
		const body = (await res.json().catch(() => null)) as { status?: string; data?: { checkout_url?: string }; message?: string } | null;
		if (!res.ok || body?.status !== "success" || !body.data?.checkout_url) {
			await this.payments.fail(row.id, body?.message ?? `Chapa initialize failed (${res.status})`);
			throw new ApiError(502, "Could not start the Chapa checkout. Please try again.", "chapa_init_failed");
		}
		return { checkoutUrl: body.data.checkout_url };
	}

	/** Verify the Standard-Webhooks-style HMAC Chapa sends with each event. */
	verifySignature(raw: string, headerSignature: string | undefined): boolean {
		const secret = setting("CHAPA_WEBHOOK_SECRET");
		if (!secret || !headerSignature) return false;
		const expected = createHmac("sha256", secret).update(raw).digest("hex");
		const a = Buffer.from(expected);
		const b = Buffer.from(headerSignature);
		return a.length === b.length && timingSafeEqual(a, b);
	}

	/** Idempotent: stores the event by tx_ref first, so a retried delivery is a no-op. */
	async handleWebhook(txRef: string, payload: unknown): Promise<void> {
		const eventId = `chapa_${txRef}`;
		const [existing] = await this.db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).limit(1);
		if (existing?.processedAt) return;
		await this.db
			.insert(webhookEvents)
			.values({ id: eventId, source: "chapa", type: "transaction.success", payload: payload as object })
			.onConflictDoNothing();
		await this.applyPaidTxRef(txRef);
		await this.db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, eventId));
	}

	/** Also used by the return_url / verify endpoint, which hits Chapa directly. */
	async verifyAndApply(txRef: string): Promise<{ ok: boolean; message: string }> {
		const res = await fetch(`${CHAPA_BASE}/transaction/verify/${encodeURIComponent(txRef)}`, {
			headers: { authorization: `Bearer ${this.secretKey()}` },
			signal: AbortSignal.timeout(15000),
		});
		const body = (await res.json().catch(() => null)) as { status?: string; data?: { status?: string } } | null;
		if (!res.ok || body?.status !== "success" || body.data?.status !== "success") {
			return { ok: false, message: "Payment not confirmed yet." };
		}
		await this.applyPaidTxRef(txRef);
		return { ok: true, message: "Payment confirmed." };
	}

	private async applyPaidTxRef(txRef: string): Promise<void> {
		const [row] = await this.db.select().from(payments).where(eq(payments.externalRef, txRef)).limit(1);
		if (!row) {
			log.warn("chapa.unknown_tx_ref");
			return;
		}
		if (row.status === "paid") return;
		await this.payments.activate(row.id);
	}

	async orgOwnerEmail(orgId: string): Promise<string | null> {
		const [row] = await this.db.select({ email: users.email }).from(organizations).innerJoin(users, eq(users.id, organizations.ownerUserId)).where(eq(organizations.id, orgId)).limit(1);
		return row?.email ?? null;
	}
}
