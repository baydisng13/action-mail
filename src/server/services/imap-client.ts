import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { ApiError } from "@/server/lib/http";

export interface ImapConfig {
	imapHost: string;
	imapPort: number;
	smtpHost: string;
	smtpPort: number;
	useTls: boolean;
	username: string;
	password: string;
}

/** Normalised message (matches the Gmail adapter's shape). */
export interface ParsedImapMessage {
	uid: number;
	providerMessageId: string; // `${uidvalidity}:${uid}`
	threadKey: string; // Message-ID or providerMessageId
	fromName?: string;
	fromAddress?: string;
	to: string[];
	subject?: string;
	snippet?: string;
	bodyText?: string;
	bodyHtml?: string;
	isUnread: boolean;
	internalDate?: Date;
}

function client(cfg: ImapConfig): ImapFlow {
	return new ImapFlow({
		host: cfg.imapHost,
		port: cfg.imapPort,
		secure: cfg.useTls,
		auth: { user: cfg.username, pass: cfg.password },
		logger: false,
		// Fail fast in a serverless function rather than hang.
		socketTimeout: 20_000,
		greetingTimeout: 10_000,
	});
}

/** Verify credentials by connecting once (used by the connect form). */
export async function testImapConnection(cfg: ImapConfig): Promise<void> {
	const c = client(cfg);
	try {
		await c.connect();
	} catch (err) {
		throw new ApiError(
			400,
			`Could not connect: ${err instanceof Error ? err.message : "unknown error"}`,
			"imap_connect_failed",
		);
	} finally {
		await c.logout().catch(() => {});
	}
}

interface InboxState {
	uidValidity: string;
	uidNext: number;
}

export async function getInboxState(cfg: ImapConfig): Promise<InboxState> {
	const c = client(cfg);
	await c.connect();
	try {
		const lock = await c.getMailboxLock("INBOX");
		try {
			const mb = c.mailbox;
			return {
				uidValidity: String(mb ? mb.uidValidity : 0),
				uidNext: mb ? Number(mb.uidNext ?? 1) : 1,
			};
		} finally {
			lock.release();
		}
	} finally {
		await c.logout().catch(() => {});
	}
}

async function parseOne(
	uid: number,
	uidValidity: string,
	source: Buffer,
	seen: boolean,
): Promise<ParsedImapMessage> {
	const p = await simpleParser(source);
	const from = p.from?.value?.[0];
	const toList = (Array.isArray(p.to) ? p.to : p.to ? [p.to] : []).flatMap(
		(a) => a.value.map((v) => v.address ?? "").filter(Boolean),
	);
	const text = p.text ?? undefined;
	const snippet = text?.replace(/\s+/g, " ").trim().slice(0, 200);
	return {
		uid,
		providerMessageId: `${uidValidity}:${uid}`,
		threadKey: p.messageId ?? `${uidValidity}:${uid}`,
		fromName: from?.name || undefined,
		fromAddress: from?.address?.toLowerCase(),
		to: toList,
		subject: p.subject ?? undefined,
		snippet,
		bodyText: text,
		bodyHtml: typeof p.html === "string" ? p.html : undefined,
		isUnread: !seen,
		internalDate: p.date ?? undefined,
	};
}

/** Fetch a set of UIDs (inclusive range or list) from INBOX. */
async function fetchUids(
	cfg: ImapConfig,
	uidValidity: string,
	range: string,
): Promise<ParsedImapMessage[]> {
	const c = client(cfg);
	await c.connect();
	const out: ParsedImapMessage[] = [];
	try {
		const lock = await c.getMailboxLock("INBOX");
		try {
			for await (const msg of c.fetch(
				range,
				{ uid: true, source: true, flags: true },
				{ uid: true },
			)) {
				if (!msg.source) continue;
				const seen = msg.flags?.has("\\Seen") ?? false;
				out.push(await parseOne(Number(msg.uid), uidValidity, msg.source, seen));
			}
		} finally {
			lock.release();
		}
	} finally {
		await c.logout().catch(() => {});
	}
	return out;
}

/** Backfill newest-first: fetch UIDs in (fromUid-count, fromUid]. */
export async function backfillBatch(
	cfg: ImapConfig,
	uidValidity: string,
	highUid: number,
	batch: number,
): Promise<ParsedImapMessage[]> {
	const low = Math.max(1, highUid - batch + 1);
	if (highUid < 1) return [];
	return fetchUids(cfg, uidValidity, `${low}:${highUid}`);
}

/** Incremental: messages with UID greater than the last synced. */
export async function fetchSince(
	cfg: ImapConfig,
	uidValidity: string,
	lastUid: number,
): Promise<ParsedImapMessage[]> {
	return fetchUids(cfg, uidValidity, `${lastUid + 1}:*`);
}

export async function sendMail(
	cfg: ImapConfig,
	msg: { to: string; subject: string; text?: string; html?: string },
): Promise<void> {
	const transport = nodemailer.createTransport({
		host: cfg.smtpHost,
		port: cfg.smtpPort,
		secure: cfg.smtpPort === 465,
		auth: { user: cfg.username, pass: cfg.password },
	});
	await transport.sendMail({ from: cfg.username, ...msg });
}
