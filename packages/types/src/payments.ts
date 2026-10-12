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

/** Base shape; the Team seat floor is enforced by `requireTeamSeats` below. */
const birrCheckoutShape = {
	plan: z.enum(["pro", "team"]),
	periodMonths: prepaidPeriodSchema,
	/** Seats to prepay. Team must be >= 2; Pro is always 1 (ignored if sent). */
	seats: z.number().int().min(1).max(500).optional(),
};

/** Reused refinement: a Team pack must prepay at least 2 seats. */
const requireTeamSeats = <T extends { plan: "pro" | "team"; seats?: number }>(v: T) =>
	v.plan !== "team" || (v.seats ?? 0) >= 2;
const teamSeatsError = { message: "A Team pack needs at least 2 seats.", path: ["seats"] };

export const birrCheckoutSchema = z.object(birrCheckoutShape).refine(requireTeamSeats, teamSeatsError);
export type BirrCheckoutInput = z.infer<typeof birrCheckoutSchema>;

export const telebirrSubmitSchema = z
	.object({ ...birrCheckoutShape, txnId: z.string().trim().min(3).max(100) })
	.refine(requireTeamSeats, teamSeatsError);
export type TelebirrSubmitInput = z.infer<typeof telebirrSubmitSchema>;

export const manualProofSchema = z
	.object({ ...birrCheckoutShape, note: z.string().max(500).optional() })
	.refine(requireTeamSeats, teamSeatsError);
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
	seats: number;
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
