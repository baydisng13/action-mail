import { describe, expect, it } from "vitest";
import { birrCheckoutSchema, manualProofSchema, telebirrSubmitSchema } from "../src/payments";
import { normalizeSeats, TEAM_MIN_SEATS } from "../src/plans";

describe("prepaid seat packs", () => {
	it("normalizeSeats forces 1 for non-team and a floor of 2 for team", () => {
		expect(normalizeSeats("free", 9)).toBe(1);
		expect(normalizeSeats("pro", 9)).toBe(1);
		expect(normalizeSeats("team", 1)).toBe(TEAM_MIN_SEATS);
		expect(normalizeSeats("team", 0)).toBe(TEAM_MIN_SEATS);
		expect(normalizeSeats("team", Number.NaN)).toBe(TEAM_MIN_SEATS);
		expect(normalizeSeats("team", 5)).toBe(5);
		expect(normalizeSeats("team", 3.9)).toBe(3);
	});

	it("birr checkout requires at least 2 seats for Team and ignores seats for Pro", () => {
		expect(birrCheckoutSchema.safeParse({ plan: "team", periodMonths: 1, seats: 1 }).success).toBe(false);
		expect(birrCheckoutSchema.safeParse({ plan: "team", periodMonths: 1 }).success).toBe(false);
		expect(birrCheckoutSchema.safeParse({ plan: "team", periodMonths: 3, seats: 2 }).success).toBe(true);
		expect(birrCheckoutSchema.safeParse({ plan: "pro", periodMonths: 1 }).success).toBe(true);
	});

	it("telebirr and manual submit inherit the Team seat floor", () => {
		expect(telebirrSubmitSchema.safeParse({ plan: "team", periodMonths: 1, seats: 1, txnId: "abc" }).success).toBe(false);
		expect(telebirrSubmitSchema.safeParse({ plan: "team", periodMonths: 1, seats: 4, txnId: "abc" }).success).toBe(true);
		expect(manualProofSchema.safeParse({ plan: "team", periodMonths: 1, seats: 1 }).success).toBe(false);
		expect(manualProofSchema.safeParse({ plan: "team", periodMonths: 1, seats: 2 }).success).toBe(true);
	});
});
