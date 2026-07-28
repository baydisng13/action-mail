import { nanoid } from "nanoid";
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
const id = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => nanoid());

const createdAt = timestamp("created_at", { withTimezone: true })
	.notNull()
	.defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
	.notNull()
	.defaultNow()
	.$onUpdate(() => new Date());

export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const membershipStatus = pgEnum("membership_status", [
	"active",
	"invited",
]);
export const planTier = pgEnum("plan_tier", ["free", "pro", "team"]);
export const subscriptionStatus = pgEnum("subscription_status", [
	"none",
	"trialing",
	"active",
	"past_due",
	"canceled",
]);
export const tokenType = pgEnum("token_type", [
	"email_verification",
	"password_reset",
]);
export const mailboxProvider = pgEnum("mailbox_provider", ["gmail", "imap"]);
export const syncStatus = pgEnum("sync_status", [
	"pending",
	"syncing",
	"ready",
	"error",
]);
export const todoStatus = pgEnum("todo_status", ["open", "done"]);
export const todoSource = pgEnum("todo_source", ["ai", "manual"]);

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable(
	"users",
	{
		id: id(),
		fullName: text("full_name").notNull(),
		email: text("email").notNull(),
		emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
		// null when the account is Google-only (no password set).
		passwordHash: text("password_hash"),
		avatarUrl: text("avatar_url"),
		createdAt,
		updatedAt,
	},
	(t) => [uniqueIndex("users_email_idx").on(t.email)],
);

// OAuth identities linked to a user (Google now; more later).
export const authIdentities = pgTable(
	"auth_identities",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(), // 'google'
		providerUid: text("provider_uid").notNull(),
		createdAt,
	},
	(t) => [
		uniqueIndex("auth_identity_provider_uid_idx").on(t.provider, t.providerUid),
		index("auth_identity_user_idx").on(t.userId),
	],
);

// ─── Teams & membership ───────────────────────────────────────────────────────
export const teams = pgTable("teams", {
	id: id(),
	name: text("name").notNull(),
	slug: text("slug").notNull(),
	// Billing owner — the person whose card pays for the whole team.
	ownerUserId: text("owner_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "restrict" }),
	// A personal team is auto-created for every new user.
	isPersonal: boolean("is_personal").notNull().default(false),
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
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		role: memberRole("role").notNull().default("member"),
		// Plan lives on the seat — each member can be on a different tier,
		// billed to the team's owner.
		plan: planTier("plan").notNull().default("free"),
		status: membershipStatus("status").notNull().default("active"),
		createdAt,
		updatedAt,
	},
	(t) => [
		uniqueIndex("membership_user_team_idx").on(t.userId, t.teamId),
		index("membership_team_idx").on(t.teamId),
	],
);

// ─── Invites ───────────────────────────────────────────────────────────────────
export const invites = pgTable(
	"invites",
	{
		id: id(),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: memberRole("role").notNull().default("member"),
		tokenHash: text("token_hash").notNull(),
		invitedByUserId: text("invited_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		createdAt,
	},
	(t) => [
		index("invite_team_idx").on(t.teamId),
		index("invite_email_idx").on(t.email),
	],
);

// ─── Refresh tokens (rotating, one row per issued token) ────────────────────────
export const refreshTokens = pgTable(
	"refresh_tokens",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull(),
		// Team the session is scoped to (active team at issue time).
		teamId: text("team_id").references(() => teams.id, {
			onDelete: "set null",
		}),
		userAgent: text("user_agent"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt,
	},
	(t) => [
		uniqueIndex("refresh_token_hash_idx").on(t.tokenHash),
		index("refresh_token_user_idx").on(t.userId),
	],
);

// ─── One-time tokens (email verification, password reset) ───────────────────────
export const verificationTokens = pgTable(
	"verification_tokens",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: tokenType("type").notNull(),
		tokenHash: text("token_hash").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		usedAt: timestamp("used_at", { withTimezone: true }),
		createdAt,
	},
	(t) => [
		uniqueIndex("verification_token_hash_idx").on(t.tokenHash),
		index("verification_token_user_idx").on(t.userId),
	],
);

// ─── Billing ────────────────────────────────────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
	id: id(),
	teamId: text("team_id")
		.notNull()
		.references(() => teams.id, { onDelete: "cascade" }),
	provider: text("provider").notNull().default("stripe"),
	providerRef: text("provider_ref"),
	seatCount: integer("seat_count").notNull().default(1),
	status: subscriptionStatus("status").notNull().default("none"),
	createdAt,
	updatedAt,
});

// Per-feature add-ons, purchased team-wide by the billing owner.
export const featurePurchases = pgTable(
	"feature_purchases",
	{
		id: id(),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		featureKey: text("feature_key").notNull(),
		status: subscriptionStatus("status").notNull().default("active"),
		providerRef: text("provider_ref"),
		createdAt,
		updatedAt,
	},
	(t) => [uniqueIndex("feature_purchase_team_key_idx").on(t.teamId, t.featureKey)],
);

// ─── Mailboxes (connected email accounts) ───────────────────────────────────────
export const mailboxes = pgTable(
	"mailboxes",
	{
		id: id(),
		// Who connected it, and the team context it belongs to.
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		provider: mailboxProvider("provider").notNull().default("gmail"),
		emailAddress: text("email_address").notNull(),
		// OAuth tokens (Gmail), encrypted at rest (AES-256-GCM). Null for IMAP.
		accessTokenEnc: text("access_token_enc"),
		refreshTokenEnc: text("refresh_token_enc"),
		tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
		scope: text("scope"),
		// IMAP/SMTP config (provider = 'imap'). Password encrypted at rest.
		imapHost: text("imap_host"),
		imapPort: integer("imap_port"),
		smtpHost: text("smtp_host"),
		smtpPort: integer("smtp_port"),
		useTls: boolean("use_tls").notNull().default(true),
		username: text("username"),
		passwordEnc: text("password_enc"),
		// Sync engine state.
		status: syncStatus("status").notNull().default("pending"),
		syncedCount: integer("synced_count").notNull().default(0),
		totalEstimate: integer("total_estimate"),
		// Resumable backfill cursor. Gmail: page token + History id.
		backfillPageToken: text("backfill_page_token"),
		historyId: text("history_id"),
		// IMAP incremental cursor: UIDVALIDITY + highest UID synced.
		imapUidValidity: text("imap_uid_validity"),
		imapLastUid: integer("imap_last_uid"),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
		error: text("error"),
		createdAt,
		updatedAt,
	},
	(t) => [
		uniqueIndex("mailbox_user_provider_email_idx").on(
			t.userId,
			t.provider,
			t.emailAddress,
		),
		index("mailbox_user_idx").on(t.userId),
		index("mailbox_team_idx").on(t.teamId),
	],
);

// ─── Threads ───────────────────────────────────────────────────────────────────
export const threads = pgTable(
	"threads",
	{
		id: id(),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		providerThreadId: text("provider_thread_id").notNull(),
		subject: text("subject"),
		snippet: text("snippet"),
		lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
		messageCount: integer("message_count").notNull().default(0),
		// Running AI summary + decision options (PRD §6.5) — filled later.
		aiState: jsonb("ai_state"),
		createdAt,
		updatedAt,
	},
	(t) => [
		uniqueIndex("thread_mailbox_provider_idx").on(
			t.mailboxId,
			t.providerThreadId,
		),
		index("thread_mailbox_last_msg_idx").on(t.mailboxId, t.lastMessageAt),
	],
);

// ─── Messages ───────────────────────────────────────────────────────────────────
export const messages = pgTable(
	"messages",
	{
		id: id(),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		threadId: text("thread_id").references(() => threads.id, {
			onDelete: "cascade",
		}),
		providerMessageId: text("provider_message_id").notNull(),
		fromAddress: text("from_address"),
		fromName: text("from_name"),
		toAddresses: jsonb("to_addresses").$type<string[]>(),
		subject: text("subject"),
		snippet: text("snippet"),
		bodyText: text("body_text"),
		bodyHtml: text("body_html"),
		labels: jsonb("labels").$type<string[]>(),
		isUnread: boolean("is_unread").notNull().default(false),
		internalDate: timestamp("internal_date", { withTimezone: true }),
		// AI classification (PRD §6.1) — populated by a later step.
		journal: text("journal"),
		// Cached action-extraction result (PRD §6.4) + when it was computed, so
		// the model never re-runs on the same message.
		aiActions: jsonb("ai_actions"),
		aiProcessedAt: timestamp("ai_processed_at", { withTimezone: true }),
		// Cached AI summary of the message body (lazy, on demand).
		aiSummary: text("ai_summary"),
		createdAt,
	},
	(t) => [
		uniqueIndex("message_mailbox_provider_idx").on(
			t.mailboxId,
			t.providerMessageId,
		),
		index("message_thread_idx").on(t.threadId),
		index("message_mailbox_date_idx").on(t.mailboxId, t.internalDate),
	],
);

// ─── To-dos (AI-derived from mail + manual) ───────────────────────────────────
export const todos = pgTable(
	"todos",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => teams.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		notes: text("notes"),
		dueAt: timestamp("due_at", { withTimezone: true }),
		status: todoStatus("status").notNull().default("open"),
		source: todoSource("source").notNull().default("manual"),
		// For AI-derived todos: link back to the source email.
		messageId: text("message_id").references(() => messages.id, {
			onDelete: "set null",
		}),
		threadId: text("thread_id").references(() => threads.id, {
			onDelete: "set null",
		}),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt,
		updatedAt,
	},
	(t) => [
		index("todo_user_status_idx").on(t.userId, t.status),
		index("todo_user_due_idx").on(t.userId, t.dueAt),
		// One AI todo per source message (dedupe re-scans). Manual todos have
		// null messageId; Postgres treats nulls as distinct so they're unbounded.
		uniqueIndex("todo_user_message_idx").on(t.userId, t.messageId),
	],
);

// ─── Inferred types ───────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Mailbox = typeof mailboxes.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
