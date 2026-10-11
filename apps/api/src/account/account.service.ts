import { Inject, Injectable } from "@nestjs/common";
import type { MeResponse } from "@postscript/types";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { LimitsService } from "../billing/limits.service";
import { isEntitled } from "../billing/plan-resolver";
import type { AuthCtx } from "../common/auth";
import { ContentCache } from "../common/content-cache";
import { orgCipher, verifyPassword } from "../common/crypto";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { features } from "../config/env";
import { DB, type Db } from "../db/db";
import {
	mailboxes,
	mailboxFolders,
	memberships,
	messages,
	organizations,
	subscriptions,
	todos,
	usageCounters,
	users,
} from "../db/schema";
import type { Envelope } from "../mail/ingest.service";
import { OrgsService } from "../orgs/orgs.service";

@Injectable()
export class AccountService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly orgs: OrgsService,
		private readonly limits: LimitsService,
		private readonly cache: ContentCache,
	) {}

	async me(ctx: AuthCtx): Promise<MeResponse> {
		const [u] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
		if (!u) throw new ApiError(404, "User not found");
		const list = await this.orgs.list(ctx.userId);
		const active = list.find((o) => o.id === ctx.orgId) ?? list[0];
		return {
			user: {
				id: u.id,
				fullName: u.fullName,
				email: u.email,
				emailVerified: Boolean(u.emailVerifiedAt),
				hasPassword: Boolean(u.passwordHash),
				avatarUrl: u.avatarUrl,
				isPlatformAdmin: ctx.isPlatformAdmin,
			},
			organizations: list,
			activeOrg: { ...active, suspended: Boolean(ctx.org.suspendedAt) },
			limits: this.limits.limitsFor(ctx.org),
			usage: await this.limits.usage(ctx.org),
			features: {
				google: features.google(),
				gmail: features.gmail(),
				ai: features.ai(),
				email: features.email(),
				billing: features.billing(),
			},
		};
	}

	async updateProfile(userId: string, fullName: string) {
		await this.db.update(users).set({ fullName: fullName.trim() }).where(eq(users.id, userId));
	}

	/** Everything Postscript stores about you (decrypted), as JSON. */
	async export(userId: string) {
		const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
		const ms = await this.db
			.select({ o: organizations, role: memberships.role })
			.from(memberships)
			.innerJoin(organizations, eq(organizations.id, memberships.organizationId))
			.where(eq(memberships.userId, userId));
		const boxes = await this.db.select().from(mailboxes).where(eq(mailboxes.userId, userId));
		const out = {
			exportedAt: new Date().toISOString(),
			note: "Email bodies and attachments are never stored by Postscript; they stay with your mail provider.",
			account: { id: u.id, fullName: u.fullName, email: u.email, createdAt: u.createdAt, emailVerifiedAt: u.emailVerifiedAt },
			workspaces: ms.map((m) => ({ id: m.o.id, name: m.o.name, role: m.role, personal: m.o.isPersonal, plan: m.o.plan })),
			mailboxes: [] as unknown[],
			todos: [] as unknown[],
			usage: [] as unknown[],
		};
		for (const b of boxes) {
			const cipher = orgCipher(b.organizationId);
			const folders = await this.db.select().from(mailboxFolders).where(eq(mailboxFolders.mailboxId, b.id));
			const msgs = await this.db.select().from(messages).where(eq(messages.mailboxId, b.id));
			out.mailboxes.push({
				id: b.id,
				workspaceId: b.organizationId,
				provider: b.provider,
				emailAddress: b.emailAddress,
				displayName: b.displayName,
				signatureHtml: b.signatureHtml,
				connectedAt: b.createdAt,
				folders: folders.map((f) => ({ name: f.name, role: f.role })),
				messages: msgs.map((m) => ({
					id: m.id,
					date: m.internalDate,
					envelope: cipher.dec<Envelope>(m.envelopeEnc),
					folders: m.roles,
					labels: m.labels,
					unread: m.isUnread,
					starred: m.isStarred,
					hasAttachments: m.hasAttachments,
					aiSummary: cipher.dec<string>(m.aiSummaryEnc),
					aiActions: cipher.dec(m.aiActionsEnc),
				})),
			});
		}
		const ts = await this.db.select().from(todos).where(eq(todos.userId, userId));
		out.todos = ts.map((t) => ({
			id: t.id,
			workspaceId: t.organizationId,
			content: orgCipher(t.organizationId).dec(t.contentEnc),
			status: t.status,
			dueAt: t.dueAt,
			source: t.source,
			createdAt: t.createdAt,
		}));
		const owned = ms.filter((m) => m.role === "owner").map((m) => m.o.id);
		if (owned.length) out.usage = await this.db.select().from(usageCounters).where(inArray(usageCounters.organizationId, owned));
		return out;
	}

	/** Delete the account and everything stored for it. */
	async deleteAccount(ctx: AuthCtx, password?: string) {
		const [u] = await this.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
		if (!u) return;
		if (u.passwordHash) {
			if (!password || !(await verifyPassword(password, u.passwordHash))) {
				throw new ApiError(400, "Your password is not correct", "bad_password");
			}
		}
		const owned = await this.db.select().from(organizations).where(eq(organizations.ownerUserId, u.id));
		for (const o of owned) {
			if (!o.isPersonal) {
				const [{ n }] = await this.db
					.select({ n: count() })
					.from(memberships)
					.where(and(eq(memberships.organizationId, o.id), ne(memberships.userId, u.id)));
				if (n > 0) {
					throw new ApiError(400, `You own "${o.name}", which has other members. Delete that workspace or remove its members first.`, "owns_team");
				}
			}
			const subs = await this.db.select().from(subscriptions).where(eq(subscriptions.organizationId, o.id));
			if (subs.some((s) => isEntitled(s) && !s.cancelAtPeriodEnd)) {
				throw new ApiError(400, `Cancel the subscription for "${o.name}" in billing first.`, "active_subscription");
			}
		}
		const boxes = await this.db.select().from(mailboxes).where(eq(mailboxes.userId, u.id));
		// Owned workspaces cascade (mailboxes, metadata, to-dos); memberships elsewhere too.
		await this.db.delete(users).where(eq(users.id, u.id));
		for (const b of boxes) await this.cache.purgeMailbox(b.organizationId, b.id).catch(() => undefined);
		for (const o of owned) await this.cache.purgeOrg(o.id).catch(() => undefined);
		log.info("account.deleted", { userId: u.id });
	}
}
