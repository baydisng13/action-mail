import { createPolar, webhooks } from "@polar-sh/sdk/2026-10";
import type { BillingInterval, PlanId } from "@postscript/types";
import { env, features } from "../config/env";
import { ApiError } from "../common/errors";

export type PolarClient = ReturnType<typeof createPolar>;

let client: PolarClient | null = null;

export function polar(): PolarClient {
	if (!features.billing()) throw new ApiError(503, "Billing is not configured yet", "billing_unconfigured");
	if (!client) {
		client = createPolar({ accessToken: env().POLAR_ACCESS_TOKEN as string, environment: env().POLAR_SERVER, timeout: 30 });
	}
	return client;
}

export function productFor(plan: Exclude<PlanId, "free">, interval: BillingInterval): string | undefined {
	const e = env();
	const map: Record<string, string | undefined> = {
		"pro:month": e.POLAR_PRODUCT_PRO_MONTHLY,
		"pro:year": e.POLAR_PRODUCT_PRO_YEARLY,
		"team:month": e.POLAR_PRODUCT_TEAM_MONTHLY,
		"team:year": e.POLAR_PRODUCT_TEAM_YEARLY,
	};
	return map[`${plan}:${interval}`];
}

export function planForProduct(productId: string): { plan: PlanId; interval: BillingInterval } | null {
	for (const plan of ["pro", "team"] as const) {
		for (const interval of ["month", "year"] as const) {
			if (productFor(plan, interval) === productId) return { plan, interval };
		}
	}
	return null;
}

export function availableIntervals(plan: "pro" | "team"): BillingInterval[] {
	return (["month", "year"] as const).filter((i) => Boolean(productFor(plan, i)));
}

/** Verify a Polar webhook (Standard Webhooks HMAC) and parse it. */
export async function verifyPolarWebhook(raw: Buffer | string, headers: Record<string, string>, secret: string) {
	return webhooks.validateEvent(typeof raw === "string" ? raw : new Uint8Array(raw), headers, secret);
}

export const PolarWebhookVerificationError = webhooks.PolarWebhookVerificationError;
export const PolarWebhookUnknownTypeError = webhooks.PolarWebhookUnknownTypeError;
