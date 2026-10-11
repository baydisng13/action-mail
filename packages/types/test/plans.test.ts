import { describe, expect, it } from "vitest";
import {
	checkAiLimit,
	checkMailboxLimit,
	checkSeatLimit,
	effectiveLimits,
	PLANS,
	usagePeriod,
} from "../src/plans";

describe("plan limits", () => {
	it("free allows exactly one mailbox", () => {
		const l = effectiveLimits("free");
		expect(checkMailboxLimit(l, 0, 0).ok).toBe(true);
		const r = checkMailboxLimit(l, 1, 1);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe("mailbox_limit");
	});

	it("pro allows five mailboxes for one person", () => {
		const l = effectiveLimits("pro");
		expect(checkMailboxLimit(l, 4, 4).ok).toBe(true);
		expect(checkMailboxLimit(l, 5, 5).ok).toBe(false);
		expect(l.seats).toBe(1);
	});

	it("team scales mailboxes and AI with seats", () => {
		const l = effectiveLimits("team", 4);
		expect(l.seats).toBe(4);
		expect(l.mailboxes).toBe(20);
		expect(l.aiActions).toBe(PLANS.team.limits.aiActionsPerSeat * 4);
		// per-user cap still applies inside a team
		expect(checkMailboxLimit(l, 5, 6).ok).toBe(false);
		expect(checkMailboxLimit(l, 2, 19).ok).toBe(true);
		expect(checkMailboxLimit(l, 2, 20).ok).toBe(false);
	});

	it("AI limit is metered per month", () => {
		const l = effectiveLimits("free");
		expect(checkAiLimit(l, 49).ok).toBe(true);
		expect(checkAiLimit(l, 50).ok).toBe(false);
		expect(checkAiLimit(l, 49, 2).ok).toBe(false);
	});

	it("seat limit counts members plus pending invites", () => {
		expect(checkSeatLimit(effectiveLimits("free"), 1).ok).toBe(true);
		expect(checkSeatLimit(effectiveLimits("free"), 2).ok).toBe(false);
		expect(checkSeatLimit(effectiveLimits("pro"), 1).ok).toBe(false);
		expect(checkSeatLimit(effectiveLimits("team", 10), 9).ok).toBe(true);
	});

	it("unknown plan falls back to free and team seats never drop below one", () => {
		expect(effectiveLimits("bogus" as never).plan).toBe("free");
		expect(effectiveLimits("team", 0).seats).toBe(1);
	});

	it("usage period is UTC year-month", () => {
		expect(usagePeriod(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
	});
});
