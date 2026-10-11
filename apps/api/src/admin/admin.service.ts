import { Inject, Injectable } from "@nestjs/common";
import { type AdminOrgRow, type AdminOverview, type AdminUserRow, type PlanId, usagePeriod } from "@postscript/types";
import { count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { BillingService } from "../billing/billing.service";
import { isEntitled, monthlyCents } from "../billing/plan-resolver";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { DB, type Db } from "../db/db";
import { mailboxes, memberships, organizations, subscriptions, usageCounters, users } from "../db/schema";

@Injectable()
export class AdminService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly billing: BillingService,
	) {}

	async overview(): Promise<AdminOverview> {
		const [{ orgs }] = await this.db.select({ orgs: count() }).from(organizations);
		const [{ us }] = await this.db.select({ us: count() }).from(users);
		const [{ mb }] = await this.db.select({ mb: count() }).from(mailboxes);
		const subs = await this.db.select().from(subscriptions);
		const live = subs.filter((s) => isEntitled(s));
		const [{ ai }] = await this.db
			.select({ ai: sql<number>`coalesce(sum(${usageCounters.aiActions}), 0)::int` })
			.from(usageCounters)
			.where(eq(usageCounters.period, usagePeriod()));
		return {
			orgs,
			users: us,
			paidOrgs: new Set(live.map((s) => s.organizationId)).size,
			mrrCents: subs.reduce((sum, s) => sum + monthlyCents(s), 0),
			aiActionsThisMonth: Number(ai),
			mailboxes: mb,
		};
	}

	async orgs(q?: string): Promise<AdminOrgRow[]> {
		const where = q ? or(ilike(organizations.name, `%${q}%`), ilike(organizations.slug, `%${q}%`)) : undefined;
		const rows = await this.db.select().from(organizations).where(where).orderBy(desc(organizations.createdAt)).limit(200);
		if (!rows.length) return [];
		const ids = rows.map((r) => r.id);
		const mem = await this.db
			.select({ id: memberships.organizationId, n: count() })
			.from(memberships)
			.where(inArray(memberships.organizationId, ids))
			.groupBy(memberships.organizationId);
		const box = await this.db
			.select({ id: mailboxes.organizationId, n: count() })
			.from(mailboxes)
			.where(inArray(mailboxes.organizationId, ids))
			.groupBy(mailboxes.organizationId);
		const use = await this.db
			.select()
			.from(usageCounters)
			.where(sql`${usageCounters.period} = ${usagePeriod()} and ${inArray(usageCounters.organizationId, ids)}`);
		const subs = await this.db.select().from(subscriptions).where(inArray(subscriptions.organizationId, ids));
		return rows.map((o) => {
			const os = subs.filter((s) => s.organizationId === o.id).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
			return {
				id: o.id,
				name: o.name,
				isPersonal: o.isPersonal,
				plan: o.plan,
				compPlan: o.compPlan,
				members: mem.find((m) => m.id === o.id)?.n ?? 0,
				mailboxes: box.find((m) => m.id === o.id)?.n ?? 0,
				aiActionsThisMonth: use.find((u) => u.organizationId === o.id)?.aiActions ?? 0,
				subscriptionStatus: os[0]?.status ?? null,
				mrrCents: os.reduce((s, x) => s + monthlyCents(x), 0),
				suspended: Boolean(o.suspendedAt),
				createdAt: o.createdAt.toISOString(),
			};
		});
	}

	async users(q?: string): Promise<AdminUserRow[]> {
		const where = q ? or(ilike(users.email, `%${q}%`), ilike(users.fullName, `%${q}%`)) : undefined;
		const rows = await this.db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(200);
		if (!rows.length) return [];
		const mem = await this.db
			.select({ id: memberships.userId, n: count() })
			.from(memberships)
			.where(inArray(memberships.userId, rows.map((r) => r.id)))
			.groupBy(memberships.userId);
		return rows.map((u) => ({
			id: u.id,
			fullName: u.fullName,
			email: u.email,
			verified: Boolean(u.emailVerifiedAt),
			organizations: mem.find((m) => m.id === u.id)?.n ?? 0,
			createdAt: u.createdAt.toISOString(),
		}));
	}

	async grant(adminEmail: string, orgId: string, plan: PlanId | null, seats?: number) {
		const [o] = await this.db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
		if (!o) throw new ApiError(404, "Workspace not found", "not_found");
		await this.db
			.update(organizations)
			.set({ compPlan: plan, compSeats: plan ? (seats ?? 1) : null })
			.where(eq(organizations.id, orgId));
		const r = await this.billing.recomputePlan(orgId);
		log.info("admin.grant", { by: adminEmail, orgId, plan, seats });
		return r;
	}

	async suspend(adminEmail: string, orgId: string, suspended: boolean, reason?: string) {
		const [o] = await this.db
			.update(organizations)
			.set({ suspendedAt: suspended ? new Date() : null, suspendedReason: suspended ? (reason ?? null) : null })
			.where(eq(organizations.id, orgId))
			.returning();
		if (!o) throw new ApiError(404, "Workspace not found", "not_found");
		log.info("admin.suspend", { by: adminEmail, orgId, suspended });
	}
}
