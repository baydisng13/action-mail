import { Inject, Injectable } from "@nestjs/common";
import type { InvitePreview, InviteView, MemberView, OrgSummary, Role } from "@postscript/types";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { createPersonalWorkspace, slugify } from "../auth/auth.service";
import { BillingService } from "../billing/billing.service";
import { LimitsService } from "../billing/limits.service";
import { isEntitled } from "../billing/plan-resolver";
import type { AuthCtx } from "../common/auth";
import { ContentCache } from "../common/content-cache";
import { generateSecret, hashSecret } from "../common/crypto";
import { ApiError } from "../common/errors";
import { env, features } from "../config/env";
import { DB, type Db } from "../db/db";
import { invites, mailboxes, memberships, organizations, subscriptions, todos, users } from "../db/schema";
import { EmailService, templates } from "../email/email.service";

const INVITE_TTL_MS = 7 * 86400_000;

@Injectable()
export class OrgsService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly limits: LimitsService,
		private readonly billing: BillingService,
		private readonly email: EmailService,
		private readonly cache: ContentCache,
	) {}

	async list(userId: string): Promise<OrgSummary[]> {
		const rows = await this.db
			.select({ o: organizations, role: memberships.role })
			.from(memberships)
			.innerJoin(organizations, eq(organizations.id, memberships.organizationId))
			.where(eq(memberships.userId, userId))
			.orderBy(asc(memberships.createdAt));
		if (!rows.length) {
			// Self-heal: a user must always have a personal workspace.
			const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
			if (u) await createPersonalWorkspace(this.db, u.id, u.fullName);
			return this.list(userId);
		}
		return rows
			.map((r) => ({ id: r.o.id, name: r.o.name, slug: r.o.slug, isPersonal: r.o.isPersonal, role: r.role, plan: r.o.plan }))
			.sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal));
	}

	async create(ctx: AuthCtx, name: string) {
		const owned = await this.db
			.select({ id: organizations.id })
			.from(organizations)
			.where(and(eq(organizations.ownerUserId, ctx.userId), eq(organizations.isPersonal, false)));
		if (owned.length >= 10) throw new ApiError(400, "You can own up to 10 team workspaces", "org_limit");
		return this.db.transaction(async (tx) => {
			const [org] = await tx
				.insert(organizations)
				.values({ name: name.trim(), slug: slugify(name), ownerUserId: ctx.userId, isPersonal: false })
				.returning();
			await tx.insert(memberships).values({ userId: ctx.userId, organizationId: org.id, role: "owner" });
			return org;
		});
	}

	async rename(ctx: AuthCtx, name: string) {
		await this.db.update(organizations).set({ name: name.trim() }).where(eq(organizations.id, ctx.orgId));
	}

	async remove(ctx: AuthCtx) {
		if (ctx.org.isPersonal) throw new ApiError(400, "Your personal workspace can't be deleted. Delete your account instead.", "personal_workspace");
		const subs = await this.db.select().from(subscriptions).where(eq(subscriptions.organizationId, ctx.orgId));
		if (subs.some((s) => isEntitled(s) && !s.cancelAtPeriodEnd)) {
			throw new ApiError(400, "Cancel the subscription in billing before deleting this workspace.", "active_subscription");
		}
		await this.db.delete(organizations).where(eq(organizations.id, ctx.orgId));
		await this.cache.purgeOrg(ctx.orgId);
	}

	async members(ctx: AuthCtx): Promise<{ members: MemberView[]; invites: InviteView[] }> {
		const ms = await this.db
			.select({ userId: users.id, fullName: users.fullName, email: users.email, role: memberships.role, joinedAt: memberships.createdAt })
			.from(memberships)
			.innerJoin(users, eq(users.id, memberships.userId))
			.where(eq(memberships.organizationId, ctx.orgId))
			.orderBy(asc(memberships.createdAt));
		const inv = await this.db
			.select()
			.from(invites)
			.where(
				and(
					eq(invites.organizationId, ctx.orgId),
					isNull(invites.acceptedAt),
					isNull(invites.revokedAt),
					gt(invites.expiresAt, new Date()),
				),
			)
			.orderBy(asc(invites.createdAt));
		return {
			members: ms.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
			invites: inv.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() })),
		};
	}

	async invite(ctx: AuthCtx, emailRaw: string, role: Role): Promise<InviteView> {
		const email = emailRaw.toLowerCase().trim();
		// A live USD (Polar) Team can oversell: accepting the invite adds a seat and
		// prorates. Every other case (personal, free, pro, birr pack, comp) keeps the
		// hard gate — assertSeatAvailable also rejects personal workspaces.
		const usdTeam = await this.billing.activePolarTeamSub(ctx.orgId);
		if (!usdTeam) await this.limits.assertSeatAvailable(ctx.org);
		const [already] = await this.db
			.select({ id: users.id })
			.from(users)
			.innerJoin(memberships, eq(memberships.userId, users.id))
			.where(and(eq(users.email, email), eq(memberships.organizationId, ctx.orgId)))
			.limit(1);
		if (already) throw new ApiError(409, "That person is already a member", "already_member");
		// Re-inviting replaces any open invite for the same email.
		await this.db
			.update(invites)
			.set({ revokedAt: new Date() })
			.where(and(eq(invites.organizationId, ctx.orgId), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.revokedAt)));
		const { secret, hash } = generateSecret();
		const [row] = await this.db
			.insert(invites)
			.values({
				organizationId: ctx.orgId,
				email,
				role,
				tokenHash: hash,
				invitedByUserId: ctx.userId,
				expiresAt: new Date(Date.now() + INVITE_TTL_MS),
			})
			.returning();
		const link = `${env().APP_URL}/invite/${secret}`;
		const [me] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, ctx.userId)).limit(1);
		await this.email.send({ to: email, ...templates.invite(ctx.org.name, me?.name ?? "A teammate", link) });
		return {
			id: row.id,
			email,
			role,
			expiresAt: row.expiresAt.toISOString(),
			// Without outbound email the inviter has to share the link by hand.
			...(features.email() ? {} : { link }),
		};
	}

	async revokeInvite(ctx: AuthCtx, id: string) {
		await this.db
			.update(invites)
			.set({ revokedAt: new Date() })
			.where(and(eq(invites.id, id), eq(invites.organizationId, ctx.orgId)));
	}

	private async inviteByToken(token: string) {
		const [row] = await this.db
			.select({ i: invites, orgName: organizations.name, inviter: users.fullName })
			.from(invites)
			.innerJoin(organizations, eq(organizations.id, invites.organizationId))
			.leftJoin(users, eq(users.id, invites.invitedByUserId))
			.where(eq(invites.tokenHash, hashSecret(token)))
			.limit(1);
		return row ?? null;
	}

	async preview(token: string): Promise<InvitePreview> {
		const row = await this.inviteByToken(token);
		if (!row || row.i.revokedAt || row.i.acceptedAt) throw new ApiError(404, "This invite is no longer valid", "invite_invalid");
		return {
			organizationName: row.orgName,
			invitedBy: row.inviter,
			email: row.i.email,
			role: row.i.role,
			expired: row.i.expiresAt < new Date(),
		};
	}

	async accept(userId: string, token: string): Promise<string> {
		const row = await this.inviteByToken(token);
		if (!row || row.i.revokedAt || row.i.acceptedAt || row.i.expiresAt < new Date()) {
			throw new ApiError(400, "This invite is no longer valid. Ask for a new one.", "invite_invalid");
		}
		const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
		if (!u || u.email.toLowerCase() !== row.i.email.toLowerCase()) {
			throw new ApiError(403, `This invite is for ${row.i.email}. Sign in with that email to accept it.`, "invite_wrong_user");
		}
		await this.db.transaction(async (tx) => {
			await tx
				.insert(memberships)
				.values({ userId, organizationId: row.i.organizationId, role: row.i.role })
				.onConflictDoNothing();
			await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, row.i.id));
		});
		// USD Team: a new accepted member is a new paid seat — push the quantity up.
		await this.billing.syncSeats(row.i.organizationId);
		return row.i.organizationId;
	}

	async updateRole(ctx: AuthCtx, userId: string, role: "admin" | "member") {
		if (ctx.role !== "owner") throw new ApiError(403, "Only the owner can change roles", "forbidden");
		if (userId === ctx.org.ownerUserId) throw new ApiError(400, "The owner's role can't be changed", "owner_role");
		await this.db
			.update(memberships)
			.set({ role })
			.where(and(eq(memberships.organizationId, ctx.orgId), eq(memberships.userId, userId)));
	}

	/** Remove a member (or leave). Their mailboxes and to-dos in this workspace go too. */
	async removeMember(ctx: AuthCtx, userId: string) {
		const self = userId === ctx.userId;
		if (userId === ctx.org.ownerUserId) {
			throw new ApiError(400, self ? "The owner can't leave. Delete the workspace instead." : "The owner can't be removed", "owner_remove");
		}
		const [target] = await this.db
			.select()
			.from(memberships)
			.where(and(eq(memberships.organizationId, ctx.orgId), eq(memberships.userId, userId)))
			.limit(1);
		if (!target) throw new ApiError(404, "Member not found", "not_found");
		if (!self) {
			if (ctx.role === "member") throw new ApiError(403, "You don't have permission to do that", "forbidden");
			if (ctx.role === "admin" && target.role !== "member") throw new ApiError(403, "Admins can only remove members", "forbidden");
		}
		const boxes = await this.db
			.select({ id: mailboxes.id })
			.from(mailboxes)
			.where(and(eq(mailboxes.organizationId, ctx.orgId), eq(mailboxes.userId, userId)));
		await this.db.transaction(async (tx) => {
			await tx.delete(mailboxes).where(and(eq(mailboxes.organizationId, ctx.orgId), eq(mailboxes.userId, userId)));
			await tx.delete(todos).where(and(eq(todos.organizationId, ctx.orgId), eq(todos.userId, userId)));
			await tx.delete(memberships).where(eq(memberships.id, target.id));
		});
		for (const b of boxes) await this.cache.purgeMailbox(ctx.orgId, b.id);
		// USD Team: one fewer member means one fewer paid seat (Polar credits the proration).
		await this.billing.syncSeats(ctx.orgId);
	}
}
