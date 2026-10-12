import { Inject, Injectable } from "@nestjs/common";
import { normalizeSeats, PLANS, type PlanId, type TelebirrReceiptFields } from "@postscript/types";
import { eq } from "drizzle-orm";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { usdToEtb } from "../config/env";
import { setting } from "../config/settings.store";
import { DB, type Db } from "../db/db";
import { payments, telebirrTransactions } from "../db/schema";
import { parseTelebirrReceipt } from "./telebirr-parser";
import { PaymentsService } from "./payments.service";

const MAX_RECEIPT_AGE_DAYS = 7;

/** Telebirr direct: customer pays the merchant number, then enters the txn id for us to verify. */
@Injectable()
export class TelebirrService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly payments: PaymentsService,
	) {}

	priceEtb(plan: Exclude<PlanId, "free">, periodMonths: number, seats = 1): number {
		const billedSeats = PLANS[plan].perSeat ? Math.max(1, seats) : 1;
		return Math.round(PLANS[plan].priceMonthly * periodMonths * billedSeats * usdToEtb());
	}

	/** Never log the relay URL or token — both can carry secrets in the query string. */
	async fetchReceiptHtml(txnId: string): Promise<string> {
		const relay = setting("TELEBIRR_RELAY_URL");
		const token = setting("TELEBIRR_RELAY_TOKEN");
		const base = setting("TELEBIRR_RECEIPT_BASE") ?? "https://transactioninfo.ethiotelecom.et/receipt/";
		if (!relay || !token) throw new ApiError(503, "Telebirr is not configured yet", "telebirr_unconfigured");
		const receiptUrl = `${base.replace(/\/$/, "")}/${encodeURIComponent(txnId)}`;
		const u = new URL(relay);
		u.searchParams.set("token", token);
		u.searchParams.set("url", receiptUrl);
		let res: Response;
		try {
			res = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) });
		} catch (err) {
			log.warn("telebirr.relay_unreachable", { err });
			throw new ApiError(502, "Could not reach the Telebirr relay. Please try again.", "telebirr_relay_unreachable");
		}
		if (!res.ok) throw new ApiError(502, `The Telebirr relay returned ${res.status}.`, "telebirr_relay_error");
		return res.text();
	}

	/** Pure check, no DB or network — used by both submit() and the admin test endpoint. */
	validateFields(fields: TelebirrReceiptFields, expectedAmountEtb: number): { ok: boolean; reason?: string } {
		const merchantName = setting("TELEBIRR_MERCHANT_NAME");
		const merchantNumber = setting("TELEBIRR_MERCHANT_NUMBER");
		if (!fields.receiverName || !fields.receiverNumber) return { ok: false, reason: "Could not read the receiver from the receipt." };
		if (merchantName && !fields.receiverName.toLowerCase().includes(merchantName.toLowerCase())) {
			return { ok: false, reason: "The receipt was not paid to this business." };
		}
		const normalize = (s: string) => s.replace(/\D/g, "").replace(/^251/, "0");
		if (merchantNumber && normalize(fields.receiverNumber) !== normalize(merchantNumber)) {
			return { ok: false, reason: "The receipt was not paid to this business." };
		}
		if (fields.amount == null || fields.amount < expectedAmountEtb) {
			return { ok: false, reason: `The receipt amount is less than the ${expectedAmountEtb} Birr required.` };
		}
		if (fields.status && /fail|cancel|reject/i.test(fields.status)) {
			return { ok: false, reason: "The receipt shows the payment did not succeed." };
		}
		if (fields.date) {
			const parsed = new Date(fields.date);
			if (!Number.isNaN(parsed.getTime())) {
				const ageDays = (Date.now() - parsed.getTime()) / 86400_000;
				if (ageDays > MAX_RECEIPT_AGE_DAYS || ageDays < -1) {
					return { ok: false, reason: "This receipt is too old to use." };
				}
			}
		}
		return { ok: true };
	}

	/** Full flow: claim the txn id (unique), fetch + parse + validate, activate or fail. */
	async submit(orgId: string, userId: string, plan: Exclude<PlanId, "free">, periodMonths: number, txnId: string, requestedSeats?: number): Promise<{ ok: boolean; message: string }> {
		const seats = normalizeSeats(plan, requestedSeats ?? 1);
		const amountEtb = this.priceEtb(plan, periodMonths, seats);
		const row = await this.payments.createPending({
			organizationId: orgId,
			userId,
			method: "telebirr",
			plan,
			periodMonths,
			seats,
			amountMinor: amountEtb * 100,
			currency: "etb",
		});
		try {
			await this.db.insert(telebirrTransactions).values({ txnId, paymentId: row.id });
		} catch {
			await this.payments.fail(row.id, "duplicate transaction id");
			throw new ApiError(409, "This transaction id has already been used.", "telebirr_duplicate");
		}
		await this.db.update(payments).set({ externalRef: txnId }).where(eq(payments.id, row.id));

		const html = await this.fetchReceiptHtml(txnId).catch(async (err) => {
			await this.payments.fail(row.id, err instanceof Error ? err.message : "fetch failed");
			throw err;
		});
		const fields = parseTelebirrReceipt(html);
		const check = this.validateFields(fields, amountEtb);
		if (!check.ok) {
			await this.payments.fail(row.id, check.reason ?? "validation failed");
			return { ok: false, message: check.reason ?? "This receipt could not be verified." };
		}
		await this.payments.activate(row.id);
		return { ok: true, message: "Payment verified. Your plan is now active." };
	}

	/** Admin test: fetch and parse a receipt by id, no payment created. */
	async testReceipt(txnId: string): Promise<{ ok: boolean; message: string; fields?: TelebirrReceiptFields }> {
		const html = await this.fetchReceiptHtml(txnId);
		const fields = parseTelebirrReceipt(html);
		const gotAny = Object.values(fields).some((v) => v != null);
		return {
			ok: gotAny,
			message: gotAny ? "Fetched and parsed the receipt." : "Fetched the receipt but could not find any known fields in it.",
			fields,
		};
	}
}
