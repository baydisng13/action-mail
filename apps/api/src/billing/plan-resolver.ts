import type { PlanId } from "@postscript/types";

export interface SubLike {
	plan: PlanId;
	status: string;
	seats: number;
	currentPeriodEnd: Date | null;
	endedAt: Date | null;
	amountCents: number;
	interval: string | null;
}

/** Does this subscription currently give the plan? */
export function isEntitled(s: SubLike, now = new Date()): boolean {
	if (s.endedAt && s.endedAt <= now) return false;
	if (s.status === "active" || s.status === "trialing" || s.status === "past_due") return true;
	// Canceled but paid until the period ends.
	return s.status === "canceled" && Boolean(s.currentPeriodEnd && s.currentPeriodEnd > now);
}

const RANK: Record<PlanId, number> = { free: 0, pro: 1, team: 2 };

/**
 * The org's effective plan. A manual grant (comp) by a platform admin wins;
 * otherwise the best entitled subscription; otherwise Free.
 */
export function resolvePlan(
	org: { compPlan: PlanId | null; compSeats: number | null },
	subs: SubLike[],
	now = new Date(),
): { plan: PlanId; seats: number; source: "free" | "subscription" | "comp" } {
	if (org.compPlan) return { plan: org.compPlan, seats: Math.max(1, org.compSeats ?? 1), source: "comp" };
	const live = subs.filter((s) => isEntitled(s, now)).sort((a, b) => RANK[b.plan] - RANK[a.plan] || b.seats - a.seats);
	if (live[0]) return { plan: live[0].plan, seats: Math.max(1, live[0].seats), source: "subscription" };
	return { plan: "free", seats: 1, source: "free" };
}

/** Monthly recurring revenue of one subscription, in cents. */
export function monthlyCents(s: SubLike, now = new Date()): number {
	if (!isEntitled(s, now) || s.status === "trialing") return 0;
	return s.interval === "year" ? Math.round(s.amountCents / 12) : s.amountCents;
}
