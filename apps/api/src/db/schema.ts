import { randomBytes } from "node:crypto";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

/** Short, url-safe, collision-resistant id. */
export const newId = () => randomBytes(12).toString("base64url");
const id = () => text("id").primaryKey().$defaultFn(newId);
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = ts("created_at").notNull().defaultNow();
const updatedAt = ts("updated_at")
	.notNull()
	.defaultNow()
	.$onUpdate(() => new Date());

export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const planTier = pgEnum("plan_tier", ["free", "pro", "team"]);
export const tokenType = pgEnum("token_type", ["email_verification", "password_reset"]);
export const mailboxProvider = pgEnum("mailbox_provider", ["gmail", "imap"]);
export const syncStatus = pgEnum("sync_status", ["pending", "syncing", "ready", "error"]);
export const todoStatus = pgEnum("todo_status", ["open", "done"]);
export const todoSource = pgEnum("todo_source", ["ai", "manual"]);
export const paymentMethod = pgEnum("payment_method", ["polar", "chapa", "telebirr", "manual"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "rejected"]);

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable(
	"users",
	{
		id: id(),
		fullName: text("full_name").notNull(),
		email: text("email").notNull(),
		emailVerifiedAt: ts("email_verified_at"),
		// null when the account is Google-only (no password set).
		passwordHash: text("password_hash"),
		avatarUrl: text("avatar_url"),
		lastActiveOrgId: text("last_active_org_id"),
		createdAt,
		updatedAt,
	},
	(t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const authIdentities = pgTable(
	"auth_identities",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		providerUid: text("provider_uid").notNull(),
		createdAt,
	},
	(t) => [
		uniqueIndex("auth_identity_provider_uid_idx").on(t.provider, t.providerUid),
		index("auth_identity_user_idx").on(t.userId),
	],
);

// ─── Organizations (workspaces) ─────────────────────────────────────────────
export const organizations = pgTable("organizations", {
	id: id(),
	name: text("name").notNull(),
	slug: text("slug").notNull(),
	isPersonal: boolean("is_personal").notNull().default(false),
	ownerUserId: text("owner_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	/** Effective plan, recomputed whenever subscriptions or comp change. */
	plan: planTier("plan").notNull().default("free"),
	/** Paid seats (Team) or the comp seat count. */
	seats: integer("seats").notNull().default(1),
	/** Manual grant by a platform admin; wins over any subscription. */
	compPlan: planTier("comp_plan"),
	compSeats: integer("comp_seats"),
	suspendedAt: ts("suspended_at"),
	suspendedReason: text("suspended_reason"),
	polarCustomerId: text("polar_customer_id"),
	createdAt,
	updatedAt,
});

export const memberships = pgTable(
	"memberships",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		role: memberRole("role").notNull().default("member"),
		createdAt,
	},
	(t) => [
		uniqueIndex("membership_user_org_idx").on(t.userId, t.organizationId),
		index("membership_org_idx").on(t.organizationId),
	],
);

export const invites = pgTable(
	"invites",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: memberRole("role").notNull().default("member"),
		tokenHash: text("token_hash").notNull(),
		invitedByUserId: text("invited_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		expiresAt: ts("expires_at").notNull(),
		acceptedAt: ts("accepted_at"),
		revokedAt: ts("revoked_at"),
		createdAt,
	},
	(t) => [
		uniqueIndex("invite_token_idx").on(t.tokenHash),
		index("invite_org_idx").on(t.organizationId),
		index("invite_email_idx").on(t.email),
	],
);

// ─── Sessions & one-time tokens ─────────────────────────────────────────────
export const refreshTokens = pgTable(
	"refresh_tokens",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull(),
		organizationId: text("organization_id").references(() => organizations.id, {
			onDelete: "set null",
		}),
		userAgent: text("user_agent"),
		expiresAt: ts("expires_at").notNull(),
		revokedAt: ts("revoked_at"),
		createdAt,
	},
	(t) => [
		uniqueIndex("refresh_token_hash_idx").on(t.tokenHash),
		index("refresh_token_user_idx").on(t.userId),
	],
);

export const verificationTokens = pgTable(
	"verification_tokens",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: tokenType("type").notNull(),
		tokenHash: text("token_hash").notNull(),
		expiresAt: ts("expires_at").notNull(),
		usedAt: ts("used_at"),
		createdAt,
	},
	(t) => [
		uniqueIndex("verification_token_hash_idx").on(t.tokenHash),
		index("verification_token_user_idx").on(t.userId),
	],
);

// ─── Billing ────────────────────────────────────────────────────────────────
export const subscriptions = pgTable(
	"subscriptions",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		polarSubscriptionId: text("polar_subscription_id").notNull(),
		polarCustomerId: text("polar_customer_id"),
		productId: text("product_id"),
		plan: planTier("plan").notNull(),
		interval: text("interval"),
		status: text("status").notNull(),
		seats: integer("seats").notNull().default(1),
		amountCents: integer("amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("usd"),
		currentPeriodEnd: ts("current_period_end"),
		cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
		endedAt: ts("ended_at"),
		/** Polar's modified_at of the last applied event, to drop stale ones. */
		sourceUpdatedAt: ts("source_updated_at"),
		createdAt,
		updatedAt,
	},
	(t) => [
		uniqueIndex("subscription_polar_idx").on(t.polarSubscriptionId),
		index("subscription_org_idx").on(t.organizationId),
	],
);

/** Every verified webhook, keyed by its delivery id (idempotency). */
export const webhookEvents = pgTable("webhook_events", {
	id: text("id").primaryKey(),
	source: text("source").notNull().default("polar"),
	type: text("type").notNull(),
	payload: jsonb("payload").notNull(),
	processedAt: ts("processed_at"),
	attempts: integer("attempts").notNull().default(0),
	error: text("error"),
	createdAt,
});

export const usageCounters = pgTable(
	"usage_counters",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		period: text("period").notNull(),
		aiActions: integer("ai_actions").notNull().default(0),
		updatedAt,
	},
	(t) => [uniqueIndex("usage_org_period_idx").on(t.organizationId, t.period)],
);

// ─── Mail ───────────────────────────────────────────────────────────────────
export const mailboxes = pgTable(
	"mailboxes",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		provider: mailboxProvider("provider").notNull().default("gmail"),
		emailAddress: text("email_address").notNull(),
		displayName: text("display_name"),
		signatureHtml: text("signature_html"),
		accessTokenEnc: text("access_token_enc"),
		refreshTokenEnc: text("refresh_token_enc"),
		tokenExpiresAt: ts("token_expires_at"),
		scope: text("scope"),
		imapHost: text("imap_host"),
		imapPort: integer("imap_port"),
		smtpHost: text("smtp_host"),
		smtpPort: integer("smtp_port"),
		useTls: boolean("use_tls").notNull().default(true),
		username: text("username"),
		passwordEnc: text("password_enc"),
		status: syncStatus("status").notNull().default("pending"),
		syncedCount: integer("synced_count").notNull().default(0),
		totalEstimate: integer("total_estimate"),
		/** Gmail: messages.list page token for the backfill. */
		backfillPageToken: text("backfill_page_token"),
		/** Gmail: history cursor for two-way incremental sync. */
		historyId: text("history_id"),
		lastSyncedAt: ts("last_synced_at"),
		error: text("error"),
		createdAt,
		updatedAt,
	},
	(t) => [
		uniqueIndex("mailbox_org_user_provider_email_idx").on(
			t.organizationId,
			t.userId,
			t.provider,
			t.emailAddress,
		),
		index("mailbox_org_user_idx").on(t.organizationId, t.userId),
	],
);

/** Folders (IMAP) and labels (Gmail) of a mailbox, with per-folder cursors. */
export const mailboxFolders = pgTable(
	"mailbox_folders",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		/** Gmail label id (INBOX, Label_12) or IMAP path (INBOX, Sent, Work/Clients). */
		providerId: text("provider_id").notNull(),
		name: text("name").notNull(),
		/** inbox | sent | drafts | archive | spam | trash | all | custom */
		role: text("role").notNull().default("custom"),
		uidValidity: text("uid_validity"),
		lastUid: integer("last_uid"),
		/** IMAP backfill: next high UID to fetch downwards; null = done. */
		backfillCursor: integer("backfill_cursor"),
		backfillDone: boolean("backfill_done").notNull().default(false),
		createdAt,
		updatedAt,
	},
	(t) => [uniqueIndex("folder_mailbox_provider_idx").on(t.mailboxId, t.providerId)],
);

export const threads = pgTable(
	"threads",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		providerThreadId: text("provider_thread_id").notNull(),
		/** Encrypted {subject, snippet} of the newest message (per-org key). */
		summaryEnc: text("summary_enc"),
		/** Keyed hash of the normalized subject, for reply threading without plaintext. */
		subjectHash: text("subject_hash"),
		lastMessageAt: ts("last_message_at"),
		messageCount: integer("message_count").notNull().default(0),
		snoozedUntil: ts("snoozed_until"),
		createdAt,
		updatedAt,
	},
	(t) => [
		uniqueIndex("thread_mailbox_provider_idx").on(t.mailboxId, t.providerThreadId),
		index("thread_mailbox_last_msg_idx").on(t.mailboxId, t.lastMessageAt),
		index("thread_org_idx").on(t.organizationId),
	],
);

export interface AttachmentMeta {
	/** Stable id within the message (a0, a1, ...). */
	id: string;
	filename: string;
	mimeType: string;
	size: number;
	contentId?: string | null;
	inline: boolean;
	/** Gmail attachmentId, when the provider gives one. */
	providerRef?: string | null;
}

export const messages = pgTable(
	"messages",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		threadId: text("thread_id").references(() => threads.id, { onDelete: "cascade" }),
		/** Gmail message id, or IMAP "<path>|<uidvalidity>|<uid>". */
		providerMessageId: text("provider_message_id").notNull(),
		/** IMAP location (null for Gmail). */
		folder: text("folder"),
		uid: integer("uid"),
		/** Keyed hashes of Message-ID / In-Reply-To / References (threading, no plaintext). */
		msgIdHash: text("msg_id_hash"),
		refHashes: jsonb("ref_hashes").$type<string[]>(),
		/**
		 * Encrypted envelope (per-org AES-256-GCM): from, to, cc, bcc, replyTo,
		 * subject, snippet, Message-ID header. Bodies and attachments are never
		 * stored; they are fetched from the provider when the message is opened.
		 */
		envelopeEnc: text("envelope_enc"),
		sizeBytes: integer("size_bytes"),
		/** Raw provider labels (Gmail label ids, or the IMAP folder path). */
		labels: jsonb("labels").$type<string[]>(),
		/** Normalized folder roles: inbox, sent, drafts, archive, spam, trash, custom. */
		roles: jsonb("roles").$type<string[]>(),
		isUnread: boolean("is_unread").notNull().default(false),
		isStarred: boolean("is_starred").notNull().default(false),
		isDraft: boolean("is_draft").notNull().default(false),
		hasAttachments: boolean("has_attachments").notNull().default(false),
		internalDate: ts("internal_date"),
		/** Encrypted AI outputs only; never the prompt or the content. */
		aiActionsEnc: text("ai_actions_enc"),
		aiProcessedAt: ts("ai_processed_at"),
		aiSummaryEnc: text("ai_summary_enc"),
		createdAt,
		updatedAt,
	},
	(t) => [
		uniqueIndex("message_mailbox_provider_idx").on(t.mailboxId, t.providerMessageId),
		index("message_thread_idx").on(t.threadId),
		index("message_mailbox_date_idx").on(t.mailboxId, t.internalDate),
		index("message_mailbox_msgid_idx").on(t.mailboxId, t.msgIdHash),
		index("message_mailbox_folder_uid_idx").on(t.mailboxId, t.folder, t.uid),
		index("message_org_idx").on(t.organizationId),
	],
);

/**
 * Compose drafts: metadata only. The content lives on the provider (Gmail
 * Drafts / IMAP Drafts folder); while a sync is pending it sits encrypted in
 * Redis with a short TTL.
 */
export const drafts = pgTable(
	"drafts",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		/** new | reply | replyAll | forward | edit */
		mode: text("mode").notNull().default("new"),
		sourceMessageId: text("source_message_id").references(() => messages.id, { onDelete: "set null" }),
		threadId: text("thread_id").references(() => threads.id, { onDelete: "set null" }),
		/** Provider-side draft reference (Gmail draft id, or IMAP "<path>|<uid>"). */
		providerDraftRef: text("provider_draft_ref"),
		version: integer("version").notNull().default(1),
		syncedVersion: integer("synced_version").notNull().default(0),
		createdAt,
		updatedAt,
	},
	(t) => [index("draft_org_user_idx").on(t.organizationId, t.userId)],
);

/** Messages waiting out the undo-send window (content is in Redis, encrypted). */
export const outbox = pgTable(
	"outbox",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		draftId: text("draft_id").references(() => drafts.id, { onDelete: "set null" }),
		/** queued | sending | sent | canceled | failed */
		status: text("status").notNull().default("queued"),
		sendAt: ts("send_at").notNull(),
		sentAt: ts("sent_at"),
		error: text("error"),
		createdAt,
		updatedAt,
	},
	(t) => [index("outbox_org_user_idx").on(t.organizationId, t.userId)],
);

export const todos = pgTable(
	"todos",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		/** Encrypted {title, notes} (per-org key). */
		contentEnc: text("content_enc").notNull(),
		dueAt: ts("due_at"),
		status: todoStatus("status").notNull().default("open"),
		source: todoSource("source").notNull().default("manual"),
		messageId: text("message_id").references(() => messages.id, { onDelete: "set null" }),
		threadId: text("thread_id").references(() => threads.id, { onDelete: "set null" }),
		completedAt: ts("completed_at"),
		createdAt,
		updatedAt,
	},
	(t) => [
		index("todo_org_user_status_idx").on(t.organizationId, t.userId, t.status),
		uniqueIndex("todo_org_user_message_idx").on(t.organizationId, t.userId, t.messageId),
	],
);

// ─── Birr payments (Chapa, Telebirr, manual proof) ──────────────────────────
/**
 * One row per payment attempt in any non-Polar method. On "paid" (or admin
 * approval for manual), BillingService writes a prepaid, non-renewing row
 * into `subscriptions` (status "canceled" with a future currentPeriodEnd) so
 * the usual plan-resolution logic (plan-resolver.ts) just works unchanged.
 */
export const payments = pgTable(
	"payments",
	{
		id: id(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
		method: paymentMethod("method").notNull(),
		status: paymentStatus("status").notNull().default("pending"),
		plan: planTier("plan").notNull(),
		/** Prepaid period length in months (1, 3, 6 or 12). Irrelevant for Polar. */
		periodMonths: integer("period_months").notNull().default(1),
		/** Smallest unit: cents for usd, birr*100 for etb (no real subunit). */
		amountMinor: integer("amount_minor").notNull(),
		currency: text("currency").notNull(),
		/** Chapa tx_ref or Telebirr transaction id; null for a manual upload. */
		externalRef: text("external_ref"),
		/** Manual proof: key on the payment-proofs volume; deleted after decision + 90 days. */
		proofFileKey: text("proof_file_key"),
		note: text("note"),
		decidedBy: text("decided_by"),
		decidedAt: ts("decided_at"),
		createdAt,
		updatedAt,
	},
	(t) => [index("payments_org_idx").on(t.organizationId), index("payments_status_idx").on(t.status)],
);

/** Telebirr transaction ids, so one receipt can only ever be used once. */
export const telebirrTransactions = pgTable("telebirr_transactions", {
	txnId: text("txn_id").primaryKey(),
	paymentId: text("payment_id")
		.notNull()
		.references(() => payments.id, { onDelete: "cascade" }),
	createdAt,
});

// ─── Platform settings ───────────────────────────────────────────────────────
/**
 * Owner-editable overrides for third-party config that otherwise comes from
 * env vars. Secret values are AES-256-GCM encrypted (see settings.store.ts);
 * non-secret values are stored as plain text. An absent row means "fall back
 * to the env var".
 */
export const platformSettings = pgTable("platform_settings", {
	key: text("key").primaryKey(),
	value: text("value"),
	isSecret: boolean("is_secret").notNull().default(false),
	updatedBy: text("updated_by"),
	updatedAt,
});

/** Who changed which setting, and when. Never the value. */
export const settingsAuditLog = pgTable(
	"settings_audit_log",
	{
		id: id(),
		key: text("key").notNull(),
		action: text("action").notNull(), // "set" | "clear"
		actorEmail: text("actor_email").notNull(),
		createdAt,
	},
	(t) => [index("settings_audit_key_idx").on(t.key)],
);

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Mailbox = typeof mailboxes.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Todo = typeof todos.$inferSelect;
export type MailboxFolder = typeof mailboxFolders.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
export type Payment = typeof payments.$inferSelect;
