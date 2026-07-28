import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { type Mailbox, mailboxes, messages, threads } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/server/lib/crypto";
import { ApiError } from "@/server/lib/http";
import { triggerSyncStep } from "@/server/lib/scheduler";
import {
	exchangeCode,
	getMessage,
	getProfile,
	listHistoryAdded,
	listMessageIds,
	type ParsedMessage,
	refreshTokens,
} from "./gmail-client";
import {
	backfillBatch,
	fetchSince,
	getInboxState,
	type ImapConfig,
	type ParsedImapMessage,
	testImapConnection,
} from "./imap-client";

const BATCH_SIZE = 20;

type Plan = "free" | "pro" | "team";

/** Normalised message shape both provider adapters map into. */
interface NormalizedMessage {
	providerMessageId: string;
	threadKey: string;
	fromName?: string;
	fromAddress?: string;
	to: string[];
	subject?: string;
	snippet?: string;
	bodyText?: string;
	bodyHtml?: string;
	labels?: string[];
	isUnread: boolean;
	internalDate?: Date;
}

function fromGmail(m: ParsedMessage): NormalizedMessage {
	return {
		providerMessageId: m.id,
		threadKey: m.threadId,
		fromName: m.fromName,
		fromAddress: m.fromAddress,
		to: m.to,
		subject: m.subject,
		snippet: m.snippet,
		bodyText: m.bodyText,
		bodyHtml: m.bodyHtml,
		labels: m.labels,
		isUnread: m.isUnread,
		internalDate: m.internalDate,
	};
}

function fromImap(m: ParsedImapMessage): NormalizedMessage {
	return {
		providerMessageId: m.providerMessageId,
		threadKey: m.threadKey,
		fromName: m.fromName,
		fromAddress: m.fromAddress,
		to: m.to,
		subject: m.subject,
		snippet: m.snippet,
		bodyText: m.bodyText,
		bodyHtml: m.bodyHtml,
		isUnread: m.isUnread,
		internalDate: m.internalDate,
	};
}

/** Decrypt a mailbox's stored IMAP/SMTP config. */
function imapConfig(m: Mailbox): ImapConfig {
	if (!m.imapHost || !m.username || !m.passwordEnc) {
		throw new ApiError(400, "Mailbox is missing IMAP config", "imap_misconfigured");
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

/**
 * Complete the Gmail connect OAuth: store the mailbox with encrypted tokens.
 * Enforces the free-tier one-mailbox limit.
 */
export async function connectGmail(
	userId: string,
	teamId: string,
	plan: Plan,
	code: string,
): Promise<{ mailboxId: string }> {
	const tokens = await exchangeCode(code);
	const profile = await getProfile(tokens.accessToken);
	const emailAddress = profile.emailAddress;

	const existing = await db
		.select()
		.from(mailboxes)
		.where(eq(mailboxes.userId, userId));

	const already = existing.find(
		(m) => m.provider === "gmail" && m.emailAddress === emailAddress,
	);

	// Free tier: a single connected mailbox. Reconnecting the same one is fine.
	if (!already && plan === "free" && existing.length >= 1) {
		throw new ApiError(
			402,
			"The free plan supports one mailbox. Upgrade to connect more.",
			"mailbox_limit",
		);
	}

	const values = {
		userId,
		teamId,
		provider: "gmail" as const,
		emailAddress,
		accessTokenEnc: encryptSecret(tokens.accessToken),
		refreshTokenEnc: tokens.refreshToken
			? encryptSecret(tokens.refreshToken)
			: already?.refreshTokenEnc ?? null,
		tokenExpiresAt: tokens.expiresAt,
		scope: tokens.scope,
		historyId: profile.historyId ?? already?.historyId ?? null,
	};

	const [row] = await db
		.insert(mailboxes)
		.values({ ...values, status: "pending" })
		.onConflictDoUpdate({
			target: [mailboxes.userId, mailboxes.provider, mailboxes.emailAddress],
			set: values,
		})
		.returning({ id: mailboxes.id });

	return { mailboxId: row.id };
}

export interface ImapConnectInput {
	emailAddress: string;
	imapHost: string;
	imapPort: number;
	smtpHost: string;
	smtpPort: number;
	useTls: boolean;
	username: string;
	password: string;
}

/**
 * Connect an IMAP/SMTP mailbox (the universal non-Gmail adapter). Verifies the
 * credentials, then stores the mailbox with the password encrypted at rest.
 */
export async function connectImap(
	userId: string,
	teamId: string,
	plan: Plan,
	input: ImapConnectInput,
): Promise<{ mailboxId: string }> {
	const emailAddress = input.emailAddress.toLowerCase().trim();

	// Verify credentials before saving anything.
	await testImapConnection({
		imapHost: input.imapHost,
		imapPort: input.imapPort,
		smtpHost: input.smtpHost,
		smtpPort: input.smtpPort,
		useTls: input.useTls,
		username: input.username,
		password: input.password,
	});

	const existing = await db
		.select()
		.from(mailboxes)
		.where(eq(mailboxes.userId, userId));
	const already = existing.find(
		(m) => m.provider === "imap" && m.emailAddress === emailAddress,
	);
	if (!already && plan === "free" && existing.length >= 1) {
		throw new ApiError(
			402,
			"The free plan supports one mailbox. Upgrade to connect more.",
			"mailbox_limit",
		);
	}

	const values = {
		userId,
		teamId,
		provider: "imap" as const,
		emailAddress,
		imapHost: input.imapHost,
		imapPort: input.imapPort,
		smtpHost: input.smtpHost,
		smtpPort: input.smtpPort,
		useTls: input.useTls,
		username: input.username,
		passwordEnc: encryptSecret(input.password),
	};

	const [row] = await db
		.insert(mailboxes)
		.values({ ...values, status: "pending" })
		.onConflictDoUpdate({
			target: [mailboxes.userId, mailboxes.provider, mailboxes.emailAddress],
			set: values,
		})
		.returning({ id: mailboxes.id });

	return { mailboxId: row.id };
}

/** Decrypt the access token, refreshing (and persisting) it if near expiry. */
async function validAccessToken(mailbox: Mailbox): Promise<string> {
	const soon = Date.now() + 30_000;
	if (
		mailbox.accessTokenEnc &&
		mailbox.tokenExpiresAt &&
		mailbox.tokenExpiresAt.getTime() > soon
	) {
		return decryptSecret(mailbox.accessTokenEnc);
	}
	if (!mailbox.refreshTokenEnc) {
		throw new ApiError(401, "Mailbox needs to be reconnected", "mailbox_reauth");
	}
	const refreshed = await refreshTokens(decryptSecret(mailbox.refreshTokenEnc));
	await db
		.update(mailboxes)
		.set({
			accessTokenEnc: encryptSecret(refreshed.accessToken),
			tokenExpiresAt: refreshed.expiresAt,
		})
		.where(eq(mailboxes.id, mailbox.id));
	return refreshed.accessToken;
}

async function loadMailbox(mailboxId: string): Promise<Mailbox> {
	const [m] = await db
		.select()
		.from(mailboxes)
		.where(eq(mailboxes.id, mailboxId))
		.limit(1);
	if (!m) throw new ApiError(404, "Mailbox not found", "mailbox_not_found");
	return m;
}

async function requireOwnedMailbox(
	userId: string,
	mailboxId: string,
): Promise<Mailbox> {
	const m = await loadMailbox(mailboxId);
	if (m.userId !== userId) {
		throw new ApiError(404, "Mailbox not found", "mailbox_not_found");
	}
	return m;
}

/** Upsert one normalised message + its thread (idempotent). */
async function ingestMessage(
	mailboxId: string,
	msg: NormalizedMessage,
): Promise<void> {
	const [thread] = await db
		.insert(threads)
		.values({
			mailboxId,
			providerThreadId: msg.threadKey,
			subject: msg.subject,
			snippet: msg.snippet,
			lastMessageAt: msg.internalDate,
			messageCount: 1,
		})
		.onConflictDoUpdate({
			target: [threads.mailboxId, threads.providerThreadId],
			set: {
				subject: msg.subject,
				snippet: msg.snippet,
				lastMessageAt: msg.internalDate,
				messageCount: sql`${threads.messageCount} + 1`,
			},
		})
		.returning({ id: threads.id });

	await db
		.insert(messages)
		.values({
			mailboxId,
			threadId: thread.id,
			providerMessageId: msg.providerMessageId,
			fromAddress: msg.fromAddress,
			fromName: msg.fromName,
			toAddresses: msg.to,
			subject: msg.subject,
			snippet: msg.snippet,
			bodyText: msg.bodyText,
			bodyHtml: msg.bodyHtml,
			labels: msg.labels,
			isUnread: msg.isUnread,
			internalDate: msg.internalDate,
		})
		.onConflictDoNothing({
			target: [messages.mailboxId, messages.providerMessageId],
		});
}

export interface SyncProgress {
	status: "pending" | "syncing" | "ready" | "error";
	syncedCount: number;
	totalEstimate: number | null;
	hasMore: boolean;
	error?: string | null;
}

/**
 * Process ONE backfill batch for a mailbox (loaded by id). Core shared by the
 * internal self-continuing step and the user-facing manual sync.
 */
async function runSyncBatch(mailbox: Mailbox): Promise<SyncProgress> {
	if (mailbox.status === "ready" && !mailbox.backfillPageToken) {
		return {
			status: "ready",
			syncedCount: mailbox.syncedCount,
			totalEstimate: mailbox.totalEstimate,
			hasMore: false,
		};
	}

	try {
		await db
			.update(mailboxes)
			.set({ status: "syncing", error: null })
			.where(eq(mailboxes.id, mailbox.id));

		return mailbox.provider === "imap"
			? await imapBatch(mailbox)
			: await gmailBatch(mailbox);
	} catch (err) {
		const message = err instanceof ApiError ? err.message : "Sync failed";
		await db
			.update(mailboxes)
			.set({ status: "error", error: message })
			.where(eq(mailboxes.id, mailbox.id));
		throw err;
	}
}

/** One Gmail backfill batch (page token + History cursor). */
async function gmailBatch(mailbox: Mailbox): Promise<SyncProgress> {
	const token = await validAccessToken(mailbox);
	const page = await listMessageIds(token, {
		pageToken: mailbox.backfillPageToken ?? undefined,
		max: BATCH_SIZE,
	});

	for (const id of page.ids) {
		await ingestMessage(mailbox.id, fromGmail(await getMessage(token, id)));
	}

	const hasMore = Boolean(page.nextPageToken);
	const syncedCount = mailbox.syncedCount + page.ids.length;

	let historyId = mailbox.historyId;
	if (!hasMore && !historyId) {
		historyId = (await getProfile(token)).historyId ?? null;
	}

	await db
		.update(mailboxes)
		.set({
			syncedCount,
			totalEstimate: page.estimate ?? mailbox.totalEstimate,
			backfillPageToken: page.nextPageToken ?? null,
			status: hasMore ? "syncing" : "ready",
			historyId,
			lastSyncedAt: new Date(),
		})
		.where(eq(mailboxes.id, mailbox.id));

	return {
		status: hasMore ? "syncing" : "ready",
		syncedCount,
		totalEstimate: page.estimate ?? mailbox.totalEstimate,
		hasMore,
	};
}

/** One IMAP backfill batch, newest UIDs first, walking down to UID 1. */
async function imapBatch(mailbox: Mailbox): Promise<SyncProgress> {
	const cfg = imapConfig(mailbox);

	// Establish UIDVALIDITY + starting high UID on the first step.
	let uidValidity = mailbox.imapUidValidity;
	let totalEstimate = mailbox.totalEstimate;
	let highUid: number;
	if (!uidValidity || mailbox.backfillPageToken == null) {
		const state = await getInboxState(cfg);
		uidValidity = state.uidValidity;
		highUid = Math.max(0, state.uidNext - 1);
		totalEstimate = highUid;
	} else {
		highUid = Number(mailbox.backfillPageToken);
	}

	const msgs =
		highUid >= 1
			? await backfillBatch(cfg, uidValidity, highUid, BATCH_SIZE)
			: [];
	for (const m of msgs) await ingestMessage(mailbox.id, fromImap(m));

	const nextHigh = Math.max(0, highUid - BATCH_SIZE);
	const hasMore = nextHigh >= 1;
	const syncedCount = mailbox.syncedCount + msgs.length;
	// Highest UID overall (first step's highUid) is the incremental baseline.
	const imapLastUid = Math.max(mailbox.imapLastUid ?? 0, highUid);

	await db
		.update(mailboxes)
		.set({
			syncedCount,
			totalEstimate,
			imapUidValidity: uidValidity,
			imapLastUid,
			backfillPageToken: hasMore ? String(nextHigh) : null,
			status: hasMore ? "syncing" : "ready",
			lastSyncedAt: new Date(),
		})
		.where(eq(mailboxes.id, mailbox.id));

	return { status: hasMore ? "syncing" : "ready", syncedCount, totalEstimate, hasMore };
}

/**
 * Internal self-continuing step (secret-authed). Runs one batch, then
 * re-triggers itself until the backfill is complete.
 */
export async function syncStep(mailboxId: string): Promise<SyncProgress> {
	const mailbox = await loadMailbox(mailboxId);
	const progress = await runSyncBatch(mailbox);
	if (progress.hasMore) triggerSyncStep(mailboxId);
	return progress;
}

/** Kick off (or resume) a background backfill. Returns immediately. */
export async function startBackfill(
	userId: string,
	mailboxId: string,
): Promise<void> {
	const mailbox = await requireOwnedMailbox(userId, mailboxId);
	if (mailbox.status === "ready" && !mailbox.backfillPageToken) return;
	triggerSyncStep(mailboxId);
}

/** Manual user-driven single batch (ownership-checked). */
export async function syncBatch(
	userId: string,
	mailboxId: string,
): Promise<SyncProgress> {
	const mailbox = await requireOwnedMailbox(userId, mailboxId);
	return runSyncBatch(mailbox);
}

/**
 * Fetch-on-open incremental: pull messages added since the stored history
 * cursor and advance it. Cheap enough to call whenever the app opens/focuses.
 */
export async function incrementalRefresh(
	userId: string,
	mailboxId: string,
): Promise<{ added: number }> {
	const mailbox = await requireOwnedMailbox(userId, mailboxId);
	// Don't run incremental until the initial backfill has finished.
	if (mailbox.status !== "ready") return { added: 0 };

	if (mailbox.provider === "imap") return imapIncremental(mailbox);

	if (!mailbox.historyId) return { added: 0 };
	const token = await validAccessToken(mailbox);
	const { ids, historyId } = await listHistoryAdded(token, mailbox.historyId);
	for (const id of ids) {
		await ingestMessage(mailbox.id, fromGmail(await getMessage(token, id)));
	}
	await db
		.update(mailboxes)
		.set({
			historyId: historyId ?? mailbox.historyId,
			syncedCount: mailbox.syncedCount + ids.length,
			lastSyncedAt: new Date(),
		})
		.where(eq(mailboxes.id, mailbox.id));
	return { added: ids.length };
}

/** IMAP incremental: messages with UID above the stored high-water mark. */
async function imapIncremental(mailbox: Mailbox): Promise<{ added: number }> {
	if (!mailbox.imapUidValidity || mailbox.imapLastUid == null) {
		return { added: 0 };
	}
	const cfg = imapConfig(mailbox);
	const state = await getInboxState(cfg);
	// UIDVALIDITY changed → the UID space was reset; skip (a full resync would
	// be needed). Rare; leave the backfilled data as-is.
	if (state.uidValidity !== mailbox.imapUidValidity) return { added: 0 };

	const msgs = await fetchSince(cfg, mailbox.imapUidValidity, mailbox.imapLastUid);
	let maxUid = mailbox.imapLastUid;
	for (const m of msgs) {
		await ingestMessage(mailbox.id, fromImap(m));
		if (m.uid > maxUid) maxUid = m.uid;
	}
	await db
		.update(mailboxes)
		.set({
			imapLastUid: maxUid,
			syncedCount: mailbox.syncedCount + msgs.length,
			lastSyncedAt: new Date(),
		})
		.where(eq(mailboxes.id, mailbox.id));
	return { added: msgs.length };
}

export async function getStatus(
	userId: string,
	mailboxId: string,
): Promise<SyncProgress & { emailAddress: string }> {
	const m = await requireOwnedMailbox(userId, mailboxId);
	return {
		status: m.status,
		syncedCount: m.syncedCount,
		totalEstimate: m.totalEstimate,
		hasMore: m.status !== "ready" || Boolean(m.backfillPageToken),
		error: m.error,
		emailAddress: m.emailAddress,
	};
}

export interface MailboxSummary {
	id: string;
	provider: "gmail" | "imap";
	emailAddress: string;
	status: "pending" | "syncing" | "ready" | "error";
	syncedCount: number;
	totalEstimate: number | null;
}

export async function listMailboxes(userId: string): Promise<MailboxSummary[]> {
	const rows = await db
		.select()
		.from(mailboxes)
		.where(eq(mailboxes.userId, userId))
		.orderBy(desc(mailboxes.createdAt));
	return rows.map((m) => ({
		id: m.id,
		provider: m.provider,
		emailAddress: m.emailAddress,
		status: m.status,
		syncedCount: m.syncedCount,
		totalEstimate: m.totalEstimate,
	}));
}

/**
 * Backfill HTML bodies for a thread's messages that were synced before we
 * stored HTML. Lazy (on thread open), bounded to the thread, cached.
 */
export async function ensureThreadHtml(threadId: string): Promise<void> {
	const [thread] = await db
		.select({ mailboxId: threads.mailboxId })
		.from(threads)
		.where(eq(threads.id, threadId))
		.limit(1);
	if (!thread) return;

	const rows = await db
		.select()
		.from(messages)
		.where(and(eq(messages.threadId, threadId), isNull(messages.bodyHtml)));
	if (rows.length === 0) return;

	const [mailbox] = await db
		.select()
		.from(mailboxes)
		.where(eq(mailboxes.id, thread.mailboxId))
		.limit(1);
	if (!mailbox) return;
	// IMAP stores HTML at sync time; only Gmail needs lazy re-fetch.
	if (mailbox.provider !== "gmail") return;

	let token: string;
	try {
		token = await validAccessToken(mailbox);
	} catch {
		return; // can't reach Gmail right now; text stays the fallback
	}

	for (const m of rows) {
		try {
			const full = await getMessage(token, m.providerMessageId);
			await db
				.update(messages)
				.set({
					bodyHtml: full.bodyHtml ?? null,
					bodyText: m.bodyText ?? full.bodyText ?? null,
				})
				.where(eq(messages.id, m.id));
		} catch (err) {
			console.error("[mailbox] html backfill failed", err);
		}
	}
}

/** Disconnect + purge all synced content (PRD §10). */
export async function disconnectMailbox(
	userId: string,
	mailboxId: string,
): Promise<void> {
	await requireOwnedMailbox(userId, mailboxId);
	await db.delete(mailboxes).where(eq(mailboxes.id, mailboxId));
}
