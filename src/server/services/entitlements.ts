import { eq } from "drizzle-orm";
import { db } from "@/db";
import { featurePurchases } from "@/db/schema";

/** Feature keys the product gates on. */
export const FEATURES = {
	JOURNALS: "journals",
	DIGEST: "newsletter_digest",
	PROMO_COLLAPSE: "promo_collapse",
	ACTION_EXTRACTION: "action_extraction",
	THREAD_COLLAPSE: "thread_collapse",
	AI_REPLY: "ai_reply",
	MULTI_MAILBOX: "multi_mailbox",
	VOICE_DIGEST: "voice_digest",
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];
export type PlanTier = "free" | "pro" | "team";

/** Base features granted by each plan tier (per seat). */
const PLAN_FEATURES: Record<PlanTier, FeatureKey[]> = {
	free: [
		FEATURES.JOURNALS,
		FEATURES.DIGEST,
		FEATURES.PROMO_COLLAPSE,
		FEATURES.ACTION_EXTRACTION,
		FEATURES.THREAD_COLLAPSE,
		FEATURES.AI_REPLY,
	],
	pro: [
		FEATURES.JOURNALS,
		FEATURES.DIGEST,
		FEATURES.PROMO_COLLAPSE,
		FEATURES.ACTION_EXTRACTION,
		FEATURES.THREAD_COLLAPSE,
		FEATURES.AI_REPLY,
		FEATURES.MULTI_MAILBOX,
	],
	team: [
		FEATURES.JOURNALS,
		FEATURES.DIGEST,
		FEATURES.PROMO_COLLAPSE,
		FEATURES.ACTION_EXTRACTION,
		FEATURES.THREAD_COLLAPSE,
		FEATURES.AI_REPLY,
		FEATURES.MULTI_MAILBOX,
	],
};

/**
 * Effective entitlements for a user = their seat's plan features
 * ∪ any per-feature add-ons the team's owner has purchased.
 */
export async function resolveEntitlements(
	plan: PlanTier,
	teamId: string,
): Promise<FeatureKey[]> {
	const purchases = await db
		.select({ key: featurePurchases.featureKey })
		.from(featurePurchases)
		.where(eq(featurePurchases.teamId, teamId));

	const set = new Set<FeatureKey>(PLAN_FEATURES[plan]);
	for (const p of purchases) set.add(p.key as FeatureKey);
	return [...set];
}
