import { Inject, Injectable } from "@nestjs/common";
import {
	checkMailboxLimit,
	checkSeatLimit,
	effectiveLimits,
	type EffectiveLimits,
	PLANS,
	type UsageSummary,
	usagePeriod,
} from "@postscript/types";
import { and, count, eq, isNull, gt, sql } from "drizzle-orm";
import { ApiError } from "../common/errors";
import { DB, type Db } from "../db/db";
import { invites, mailboxes, memberships, type Organization, usageCounters } from "../db/schema";

/** Enforces plan limits. Numbers come from PLANS in @postscript/types. */
@Injectable()
export class LimitsService {
	constructor(@Inject(DB) private readonly db: Db) {}

	limitsFor(org: Pick<Organization, "plan" | "seats">): EffectiveLimits {
		return effectiveLimits(org.plan, org.seats);
	}

	async aiUsed(orgId: string, period = usagePeriod()): Promise<number> {
		const [row] = await this.db
			.select({ n: usageCounters.aiActions })
			.from(usageCounters)
			.where(and(eq(usageCounters.organizationId, orgId), eq(usageCounters.period, period)))
			.limit(1);
		return row?.n ?? 0;
	}

	/**
	 * Atomically count one AI action against the org's monthly allowance.
	 * Throws 402 ai_limit when the allowance is used up; never over-counts
	 * under concurrency because the check and the increment are one statement.
	 */
	async meterAi(org: Pick<Organization, "id" | "plan" | "seats">, cost = 1): Promise<void> {
		const limit = this.limitsFor(org).aiActions;
		const period = usagePeriod();
		if (cost > limit) throw this.aiLimitError(limit);
		const rows = await this.db.execute<{ ai_actions: number }>(sql`
			insert into usage_counters (id, organization_id, period, ai_actions, updated_at)
			values (${`u_${org.id}_${period}`}, ${org.id}, ${period}, ${cost}, now())
			on conflict (organization_id, period) do update
				set ai_actions = usage_counters.ai_actions + ${cost}, updated_at = now()
				where usage_counters.ai_actions + ${cost} <= ${limit}
			returning ai_actions`);
		if (!rows.length) throw this.aiLimitError(limit);
	}

	private aiLimitError(limit: number) {
		return new ApiError(402, `You have used all ${limit} AI actions for this month. Upgrade for more.`, "ai_limit");
	}

	async assertCanAddMailbox(org: Pick<Organization, "id" | "plan" | "seats">, userId: string): Promise<void> {
		const limits = this.limitsFor(org);
		const [{ n: orgCount }] = await this.db
			.select({ n: count() })
			.from(mailboxes)
			.where(eq(mailboxes.organizationId, org.id));
		const [{ n: userCount }] = await this.db
			.select({ n: count() })
			.from(mailboxes)
			.where(and(eq(mailboxes.organizationId, org.id), eq(mailboxes.userId, userId)));
		const r = checkMailboxLimit(limits, userCount, orgCount);
		if (!r.ok) throw new ApiError(402, r.message, r.code);
	}

	async seatsUsed(orgId: string): Promise<number> {
		const [{ n: members }] = await this.db
			.select({ n: count() })
			.from(memberships)
			.where(eq(memberships.organizationId, orgId));
		const [{ n: pending }] = await this.db
			.select({ n: count() })
			.from(invites)
			.where(
				and(
					eq(invites.organizationId, orgId),
					isNull(invites.acceptedAt),
					isNull(invites.revokedAt),
					gt(invites.expiresAt, new Date()),
				),
			);
		return members + pending;
	}

	async assertSeatAvailable(org: Pick<Organization, "id" | "plan" | "seats" | "isPersonal">): Promise<void> {
		if (org.isPersonal) {
			throw new ApiError(400, "Your personal workspace is just for you. Create a team workspace to invite people.", "personal_workspace");
		}
		const r = checkSeatLimit(this.limitsFor(org), await this.seatsUsed(org.id));
		if (!r.ok) throw new ApiError(402, r.message, r.code);
	}

	async usage(org: Pick<Organization, "id" | "plan" | "seats">): Promise<UsageSummary> {
		const limits = this.limitsFor(org);
		const [{ n: mb }] = await this.db.select({ n: count() }).from(mailboxes).where(eq(mailboxes.organizationId, org.id));
		return {
			period: usagePeriod(),
			aiActionsUsed: await this.aiUsed(org.id),
			aiActionsLimit: limits.aiActions,
			mailboxes: mb,
			mailboxesLimit: limits.mailboxes,
			seatsUsed: await this.seatsUsed(org.id),
			seatsLimit: limits.seats,
		};
	}

	planName(org: Pick<Organization, "plan">) {
		return PLANS[org.plan].name;
	}
}
