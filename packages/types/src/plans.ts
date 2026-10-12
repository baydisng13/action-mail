/**
 * Plans, prices and limits. This is the ONE place to change what each plan
 * costs and allows. The api enforces these numbers; the web shows them.
 *
 * Prices here are display prices only. What a customer is actually charged is
 * whatever the Polar product (POLAR_PRODUCT_* env) is set to, so keep the two
 * in sync when you change a price.
 */
export type PlanId = "free" | "pro" | "team";
export type BillingInterval = "month" | "year";

export interface PlanLimits {
	/** Mailboxes a single person may connect in this workspace. */
	mailboxesPerUser: number;
	/** Mailboxes the whole workspace may hold (per seat for Team). */
	mailboxesPerSeat: number;
	/** AI actions per calendar month (per seat for Team). */
	aiActionsPerSeat: number;
	/** People in the workspace, counting pending invites. null = paid seats. */
	maxSeats: number | null;
	/** Background AI triage after each sync (paid plans only). */
	autoTriage: boolean;
}

export interface PlanDefinition {
	id: PlanId;
	name: string;
	tagline: string;
	/** Display price in USD. Team is per seat. */
	priceMonthly: number;
	priceYearly: number;
	perSeat: boolean;
	limits: PlanLimits;
	features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
	free: {
		id: "free",
		name: "Free",
		tagline: "For trying Postscript with one inbox.",
		priceMonthly: 0,
		priceYearly: 0,
		perSeat: false,
		limits: {
			mailboxesPerUser: 1,
			mailboxesPerSeat: 1,
			aiActionsPerSeat: 50,
			maxSeats: 2,
			autoTriage: false,
		},
		features: [
			"1 connected mailbox",
			"50 AI actions a month",
			"Codes and links pulled out of mail",
			"Reader mode and to-dos",
		],
	},
	pro: {
		id: "pro",
		name: "Pro",
		tagline: "For one person with a busy inbox.",
		priceMonthly: 9,
		priceYearly: 90,
		perSeat: false,
		limits: {
			mailboxesPerUser: 5,
			mailboxesPerSeat: 5,
			aiActionsPerSeat: 2000,
			maxSeats: 1,
			autoTriage: true,
		},
		features: [
			"Up to 5 mailboxes",
			"2,000 AI actions a month",
			"All AI features",
			"Automatic to-dos after every sync",
		],
	},
	team: {
		id: "team",
		name: "Team",
		tagline: "For small teams on shared billing.",
		priceMonthly: 12,
		priceYearly: 120,
		perSeat: true,
		limits: {
			mailboxesPerUser: 5,
			mailboxesPerSeat: 5,
			aiActionsPerSeat: 2000,
			maxSeats: null,
			autoTriage: true,
		},
		features: [
			"Everything in Pro, for each seat",
			"Invite members with roles",
			"One bill for the whole team",
			"AI actions pooled across the team",
		],
	},
};

export const PLAN_IDS: PlanId[] = ["free", "pro", "team"];

/** Team is a shared-billing plan: it never makes sense with fewer than this many seats. */
export const TEAM_MIN_SEATS = 2;

/** Clamp a requested seat count for a plan: Team has a floor of 2; others are always 1. */
export function normalizeSeats(plan: PlanId, requested: number): number {
	if (plan !== "team") return 1;
	return Math.max(TEAM_MIN_SEATS, Math.floor(requested) || TEAM_MIN_SEATS);
}

/** Resolved, numeric limits for a workspace on a plan with N paid seats. */
export interface EffectiveLimits {
	plan: PlanId;
	seats: number;
	mailboxesPerUser: number;
	mailboxes: number;
	aiActions: number;
	autoTriage: boolean;
}

export function effectiveLimits(plan: PlanId, paidSeats = 1): EffectiveLimits {
	const def = PLANS[plan] ?? PLANS.free;
	const seats = def.limits.maxSeats ?? Math.max(1, paidSeats);
	const billedSeats = def.perSeat ? seats : 1;
	return {
		plan: def.id,
		seats,
		mailboxesPerUser: def.limits.mailboxesPerUser,
		mailboxes: def.limits.mailboxesPerSeat * billedSeats,
		aiActions: def.limits.aiActionsPerSeat * billedSeats,
		autoTriage: def.limits.autoTriage,
	};
}

export type LimitCheck =
	| { ok: true }
	| { ok: false; code: "mailbox_limit" | "ai_limit" | "seat_limit"; message: string };

export function checkMailboxLimit(
	limits: EffectiveLimits,
	userMailboxes: number,
	orgMailboxes: number,
): LimitCheck {
	if (userMailboxes >= limits.mailboxesPerUser || orgMailboxes >= limits.mailboxes) {
		const n = Math.min(limits.mailboxesPerUser, limits.mailboxes);
		return {
			ok: false,
			code: "mailbox_limit",
			message: `Your ${PLANS[limits.plan].name} plan allows ${n} mailbox${n === 1 ? "" : "es"}. Upgrade to connect more.`,
		};
	}
	return { ok: true };
}

export function checkAiLimit(limits: EffectiveLimits, usedThisMonth: number, cost = 1): LimitCheck {
	if (usedThisMonth + cost > limits.aiActions) {
		return {
			ok: false,
			code: "ai_limit",
			message: `You have used all ${limits.aiActions} AI actions for this month. Upgrade for more.`,
		};
	}
	return { ok: true };
}

export function checkSeatLimit(limits: EffectiveLimits, membersAndPending: number): LimitCheck {
	if (membersAndPending >= limits.seats) {
		return {
			ok: false,
			code: "seat_limit",
			message: `This workspace has ${limits.seats} seat${limits.seats === 1 ? "" : "s"} and all are taken. Upgrade to Team or add seats.`,
		};
	}
	return { ok: true };
}

/** Billing period key for usage counters, e.g. "2026-10" (UTC). */
export function usagePeriod(d = new Date()): string {
	return d.toISOString().slice(0, 7);
}
