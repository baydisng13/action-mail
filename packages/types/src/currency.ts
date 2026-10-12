import { z } from "zod";

export type Currency = "usd" | "etb";

/**
 * Resolve a currency from a Cloudflare country header first, then an
 * Accept-Language / IANA timezone fallback. Pure function so both the api
 * (header + Accept-Language) and the web (timezone) can use it the same way.
 */
export function detectCurrency(opts: { cfCountry?: string | null; acceptLanguage?: string | null; timeZone?: string | null }): Currency {
	const country = opts.cfCountry?.trim().toUpperCase();
	if (country) return country === "ET" ? "etb" : "usd";
	if (opts.timeZone === "Africa/Addis_Ababa") return "etb";
	if (opts.acceptLanguage?.toLowerCase().includes("am-et") || opts.acceptLanguage?.toLowerCase().includes("am;")) return "etb";
	return "usd";
}

/** USD display price -> whole-birr price (no cents in everyday ETB pricing). */
export function usdToEtbWhole(usd: number, rate: number): number {
	return Math.round(usd * rate);
}

export function formatMoney(amount: number, currency: Currency): string {
	if (currency === "etb") return `${amount.toLocaleString("en-US")} Birr`;
	return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export const PREPAID_PERIODS = [1, 3, 6, 12] as const;
export type PrepaidPeriodMonths = (typeof PREPAID_PERIODS)[number];

export const prepaidPeriodSchema = z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]);
