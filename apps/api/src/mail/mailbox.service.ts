import { Inject, Injectable } from "@nestjs/common";
import type { FolderView, ImapConnectInput, MailboxSummary } from "@postscript/types";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AuthCtx } from "../common/auth";
import { ContentCache } from "../common/content-cache";
import { decryptSecret, encryptSecret } from "../common/crypto";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { LimitsService } from "../billing/limits.service";
import { DB, type Db } from "../db/db";
import { type Mailbox, mailboxes, mailboxFolders, type Organization, organizations } from "../db/schema";
import { QueueService } from "../queue/queue.service";
import * as gmail from "./gmail.client";
import { type ImapConfig, testConnection } from "./imap.client";

/** Scope used by every mail query: this user's mailboxes in this workspace. */
export interface MailScope {
	orgId: string;
	userId: string;
}

export function scopeOf(ctx: AuthCtx): MailScope {
	return { orgId: ctx.orgId, userId: ctx.userId };
}

export function toSummary(m: Mailbox): MailboxSummary {
	return {
		id: m.id,
		provider: m.provider,
		emailAddress: m.emailAddress,
		displayName: m.displayName,
		signatureHtml: m.signatureHtml,
		status: m.status,
		syncedCount: m.syncedCount,
		totalEstimate: m.totalEstimate,
		lastSyncedAt: m.lastSyncedAt?.toISOString() ?? null,
		error: m.error,
	};
}

@Injectable()
export class MailboxService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly limits: LimitsService,
		private readonly queues: QueueService,
		private readonly cache: ContentCache,
	) {}

	/** Tenant-isolated lookup: wrong org or someone else's mailbox is a 404. */
	async require(scope: MailScope, mailboxId: string): Promise<Mailbox> {
		const [m] = await this.db
			.select()
			.from(mailboxes)
			.where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.organizationId, scope.orgId), eq(mailboxes.userId, scope.userId)))
			.limit(1);
		if (!m) throw new ApiError(404, "Mailbox not found", "mailbox_not_found");
		return m;
	}

	async list(scope: MailScope): Promise<Mailbox[]> {
		return this.db
			.select()
			.from(mailboxes)
			.where(and(eq(mailboxes.organizationId, scope.orgId), eq(mailboxes.userId, scope.userId)))
			.orderBy(desc(mailboxes.createdAt));
	}

	async allForUser(userId: string): Promise<Mailbox[]> {
		return this.db.select().from(mailboxes).where(eq(mailboxes.userId, userId));
	}

	async byId(id: string): Promise<Mailbox | null> {
		const [m] = await this.db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
		return m ?? null;
	}

	async connectGmail(input: { userId: string; orgId: string; code: string }): Promise<Mailbox> {
		const [org] = await this.db.select().from(organizations).where(eq(organizations.id, input.orgId)).limit(1);
		if (!org) throw new ApiError(404, "Workspace not found");
		const tokens = await gmail.exchangeCode(input.code);
		const profile = await gmail.getProfile(tokens.accessToken);
		const existing = await this.findExisting(input.orgId, input.userId, "gmail", profile.emailAddress);
		if (!existing) await this.limits.assertCanAddMailbox(org, input.userId);

		const values = {
			organizationId: input.orgId,
			userId: input.userId,
			provider: "gmail" as const,
			emailAddress: profile.emailAddress,
			accessTokenEnc: encryptSecret(tokens.accessToken),
			refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : (existing?.refreshTokenEnc ?? null),
			tokenExpiresAt: tokens.expiresAt,
			scope: tokens.scope,
			totalEstimate: profile.messagesTotal ?? null,
			error: null,
		};
		const [row] = await this.db
			.insert(mailboxes)
			.values({ ...values, status: "pending" })
			.onConflictDoUpdate({
				target: [mailboxes.organizationId, mailboxes.userId, mailboxes.provider, mailboxes.emailAddress],
				set: values,
			})
			.returning();
		await this.queues.safe("backfill", () => this.queues.backfill(row.id, row.syncedCount));
		return row;
	}

	async connectImap(ctx: AuthCtx, input: ImapConnectInput): Promise<Mailbox> {
		const emailAddress = input.emailAddress.toLowerCase().trim();
		const existing = await this.findExisting(ctx.orgId, ctx.userId, "imap", emailAddress);
		if (!existing) await this.limits.assertCanAddMailbox(ctx.org, ctx.userId);
		await testConnection({ ...input });

		const values = {
			organizationId: ctx.orgId,
			userId: ctx.userId,
			provider: "imap" as const,
			emailAddress,
			imapHost: input.imapHost.trim(),
			imapPort: input.imapPort,
			smtpHost: input.smtpHost.trim(),
			smtpPort: input.smtpPort,
			useTls: input.useTls,
			username: input.username.trim(),
			passwordEnc: encryptSecret(input.password),
			error: null,
		};
		const [row] = await this.db
			.insert(mailboxes)
			.values({ ...values, status: "pending" })
			.onConflictDoUpdate({
				target: [mailboxes.organizationId, mailboxes.userId, mailboxes.provider, mailboxes.emailAddress],
				set: values,
			})
			.returning();
		await this.queues.safe("backfill", () => this.queues.backfill(row.id, row.syncedCount));
		return row;
	}

	private async findExisting(orgId: string, userId: string, provider: "gmail" | "imap", email: string) {
		const [m] = await this.db
			.select()
			.from(mailboxes)
			.where(
				and(
					eq(mailboxes.organizationId, orgId),
					eq(mailboxes.userId, userId),
					eq(mailboxes.provider, provider),
					eq(mailboxes.emailAddress, email),
				),
			)
			.limit(1);
		return m ?? null;
	}

	async update(scope: MailScope, id: string, patch: { displayName?: string | null; signatureHtml?: string | null }) {
		await this.require(scope, id);
		const [row] = await this.db
			.update(mailboxes)
			.set({
				...(patch.displayName !== undefined ? { displayName: patch.displayName?.trim() || null } : {}),
				...(patch.signatureHtml !== undefined ? { signatureHtml: patch.signatureHtml || null } : {}),
			})
			.where(eq(mailboxes.id, id))
			.returning();
		return row;
	}

	/** Disconnect: delete the mailbox and everything stored for it, now. */
	async disconnect(scope: MailScope, id: string): Promise<void> {
		const m = await this.require(scope, id);
		await this.db.delete(mailboxes).where(eq(mailboxes.id, m.id));
		await this.cache.purgeMailbox(m.organizationId, m.id).catch((err) => log.error("cache.purge_failed", { err }));
		log.info("mailbox.disconnected", { mailboxId: m.id, orgId: m.organizationId });
	}

	/** Valid Gmail access token, refreshed and persisted when near expiry. */
	async gmailToken(m: Mailbox): Promise<string> {
		if (m.accessTokenEnc && m.tokenExpiresAt && m.tokenExpiresAt.getTime() > Date.now() + 60_000) {
			return decryptSecret(m.accessTokenEnc);
		}
		if (!m.refreshTokenEnc) throw new ApiError(401, "This Gmail account needs to be reconnected", "mailbox_reauth");
		try {
			const t = await gmail.refreshAccess(decryptSecret(m.refreshTokenEnc));
			await this.db
				.update(mailboxes)
				.set({ accessTokenEnc: encryptSecret(t.accessToken), tokenExpiresAt: t.expiresAt })
				.where(eq(mailboxes.id, m.id));
			m.accessTokenEnc = encryptSecret(t.accessToken);
			m.tokenExpiresAt = t.expiresAt;
			return t.accessToken;
		} catch (err) {
			await this.db
				.update(mailboxes)
				.set({ status: "error", error: "Gmail access was revoked. Please reconnect." })
				.where(eq(mailboxes.id, m.id));
			throw err;
		}
	}

	imapConfig(m: Mailbox): ImapConfig {
		if (!m.imapHost || !m.username || !m.passwordEnc) {
			throw new ApiError(400, "Mailbox is missing its server settings", "imap_misconfigured");
		}
		return {
			imapHost: m.imapHost,
			imapPort: m.imapPort ?? 993,
			smtpHost: m.smtpHost ?? m.imapHost,
			smtpPort: m.smtpPort ?? 465,
			useTls: m.useTls,
			username: m.username,
			password: decryptSecret(m.passwordEnc),
		};
	}

	async folders(scope: MailScope, mailboxId?: string): Promise<FolderView[]> {
		const boxes = mailboxId ? [await this.require(scope, mailboxId)] : await this.list(scope);
		if (!boxes.length) return [];
		const ids = boxes.map((b) => b.id);
		const rows = await this.db
			.select()
			.from(mailboxFolders)
			.where(and(eq(mailboxFolders.organizationId, scope.orgId), inArray(mailboxFolders.mailboxId, ids)));
		// Unread threads per folder, computed from flags only (no content).
		const counts = await this.db.execute<{ folder_id: string; unread: number }>(sql`
			select f.id as folder_id, count(distinct m.thread_id)::int as unread
			from mailbox_folders f
			join mailboxes mb on mb.id = f.mailbox_id
			join messages m on m.mailbox_id = f.mailbox_id and m.is_unread
				and (case when mb.provider = 'gmail'
					then (case when f.provider_id = '__ARCHIVE' then m.roles ? 'archive' else m.labels ? f.provider_id end)
					else m.folder = f.provider_id end)
			where f.organization_id = ${scope.orgId} and f.mailbox_id in ${sql.raw(`(${ids.map((i) => `'${i.replace(/'/g, "")}'`).join(",")})`)}
			group by f.id`);
		const unread = new Map(counts.map((c) => [c.folder_id, Number(c.unread)]));
		const order = ["inbox", "drafts", "sent", "archive", "spam", "trash", "all", "custom"];
		return rows
			.map((f) => ({
				id: f.id,
				mailboxId: f.mailboxId,
				name: f.name,
				role: f.role as FolderView["role"],
				unread: unread.get(f.id) ?? 0,
			}))
			.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name));
	}

	async orgOf(m: Mailbox): Promise<Organization> {
		const [o] = await this.db.select().from(organizations).where(eq(organizations.id, m.organizationId)).limit(1);
		return o;
	}
}
