import { z } from "zod";
import type { PlanId } from "./plans";
import { prepaidPeriodSchema } from "./currency";

export type PaymentMethod = "polar" | "chapa" | "telebirr" | "manual";
export type PaymentStatus = "pending" | "paid" | "failed" | "rejected";

export interface PaymentMethodsAvailable {
	polar: boolean;
	chapa: boolean;
	telebirr: boolean;
	manual: boolean;
}

/** GET /api/billing/payment-options (public). */
export interface PaymentOptionsResponse {
	usdToEtb: number;
	suggestedCurrency: "usd" | "etb";
	methods: PaymentMethodsAvailable;
	telebirr: {
		merchantNumber: string | null;
		merchantName: string | null;
		instructions: string;
	};
}

export const birrCheckoutSchema = z.object({
	plan: z.enum(["pro", "team"]),
	periodMonths: prepaidPeriodSchema,
});
export type BirrCheckoutInput = z.infer<typeof birrCheckoutSchema>;

export const telebirrSubmitSchema = birrCheckoutSchema.extend({
	txnId: z.string().trim().min(3).max(100),
});
export type TelebirrSubmitInput = z.infer<typeof telebirrSubmitSchema>;

export const manualProofSchema = birrCheckoutSchema.extend({
	note: z.string().max(500).optional(),
});
export type ManualProofInput = z.infer<typeof manualProofSchema>;

export interface PaymentRow {
	id: string;
	organizationId: string;
	organizationName: string;
	userEmail: string | null;
	method: PaymentMethod;
	status: PaymentStatus;
	plan: PlanId;
	periodMonths: number;
	amountMinor: number;
	currency: string;
	externalRef: string | null;
	note: string | null;
	hasProof: boolean;
	decidedBy: string | null;
	decidedAt: string | null;
	createdAt: string;
}

export const paymentDecisionSchema = z.object({
	reason: z.string().max(300).optional(),
});

/** Fields pulled out of a Telebirr receipt page, defensively (any may be null). */
export interface TelebirrReceiptFields {
	payerName: string | null;
	receiverName: string | null;
	receiverNumber: string | null;
	amount: number | null;
	date: string | null;
	status: string | null;
	transactionId: string | null;
}

export interface TelebirrTestResult {
	ok: boolean;
	message: string;
	fields?: TelebirrReceiptFields;
}
