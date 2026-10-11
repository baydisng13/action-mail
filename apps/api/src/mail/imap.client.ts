import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ImapFlow, type FetchMessageObject, type MessageStructureObject } from "imapflow";
import nodemailer from "nodemailer";
import { ApiError } from "../common/errors";
import { scrub } from "../common/logger";

export interface ImapConfig {
	imapHost: string;
	imapPort: number;
	smtpHost: string;
	smtpPort: number;
	useTls: boolean;
	username: string;
	password: string;
}

/** Private, loopback and link-local ranges: blocked as mail hosts (SSRF). */
export function isPrivateAddress(ip: string): boolean {
	if (isIP(ip) === 6) {
		const v = ip.toLowerCase();
		if (v === "::1" || v === "::") return true;
		if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
		if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
		return false;
	}
	const [a, b] = ip.split(".").map(Number);
	return (
		a === 10 ||
		a === 127 ||
		a === 0 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127)
	);
}

export async function assertPublicHost(host: string): Promise<void> {
	if (process.env.IMAP_ALLOW_PRIVATE_HOSTS === "true") return;
	try {
		const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
		if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
			throw new ApiError(400, `The server ${host} is not reachable from Postscript.`, "imap_host_blocked");
		}
	} catch (err) {
		if (err instanceof ApiError) throw err;
		throw new ApiError(400, `Could not find the server ${host}. Check the address.`, "imap_host_unknown");
	}
}

export function imapClient(cfg: ImapConfig): ImapFlow {
	return new ImapFlow({
		host: cfg.imapHost,
		port: cfg.imapPort,
		secure: cfg.useTls,
		auth: { user: cfg.username, pass: cfg.password },
		logger: false,
		socketTimeout: 60_000,
		greetingTimeout: 15_000,
		connectionTimeout: 15_000,
		// Plain (non-TLS) servers: don't try STARTTLS on test servers that lack it.
		doSTARTTLS: cfg.useTls ? undefined : false,
	});
}

/** Connect, run, always log out. */
export async function withImap<T>(cfg: ImapConfig, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
	const c = imapClient(cfg);
	c.on("error", () => undefined);
	try {
		await c.connect();
	} catch (err) {
		throw new ApiError(
			400,
			`Could not connect to the mail server: ${scrub(err instanceof Error ? err.message : "unknown error")}`,
			"imap_connect_failed",
		);
	}
	try {
		return await fn(c);
	} finally {
		await c.logout().catch(() => c.close());
	}
}

export async function withFolder<T>(c: ImapFlow, path: string, fn: () => Promise<T>): Promise<T> {
	const lock = await c.getMailboxLock(path);
	try {
		return await fn();
	} finally {
		lock.release();
	}
}

export interface ImapFolderInfo {
	path: string;
	name: string;
	role: string;
}

const NAME_ROLES: Array<[RegExp, string]> = [
	[/^(sent|sent items|sent mail|sent messages|gesendet|envoy[ée]s)$/i, "sent"],
	[/^(drafts?|entw[üu]rfe|brouillons)$/i, "drafts"],
	[/^(trash|deleted|deleted items|deleted messages|bin|papierkorb|corbeille)$/i, "trash"],
	[/^(junk|spam|junk e-?mail|bulk mail)$/i, "spam"],
	[/^(archive|archives|all mail)$/i, "archive"],
];

/** List selectable folders with roles; skips virtual "All"/"Flagged" folders. */
export async function listFolders(c: ImapFlow): Promise<ImapFolderInfo[]> {
	const list = await c.list();
	const out: ImapFolderInfo[] = [];
	for (const f of list) {
		const flags = f.flags instanceof Set ? f.flags : new Set<string>();
		if (flags.has("\\Noselect") || flags.has("\\NonExistent")) continue;
		const su = (f.specialUse ?? "").toLowerCase();
		if (su === "\\all" || su === "\\flagged" || su === "\\important") continue;
		let role = "custom";
		if (f.path.toUpperCase() === "INBOX") role = "inbox";
		else if (su === "\\sent") role = "sent";
		else if (su === "\\drafts") role = "drafts";
		else if (su === "\\trash") role = "trash";
		else if (su === "\\junk") role = "spam";
		else if (su === "\\archive") role = "archive";
		else {
			const leaf = f.name ?? f.path;
			for (const [re, r] of NAME_ROLES) if (re.test(leaf)) role = r;
		}
		out.push({ path: f.path, name: f.path.toUpperCase() === "INBOX" ? "Inbox" : f.name ?? f.path, role });
	}
	// One folder per system role (first wins); extra matches become custom.
	const seen = new Set<string>();
	for (const f of out) {
		if (f.role === "custom") continue;
		if (seen.has(f.role)) f.role = "custom";
		else seen.add(f.role);
	}
	return out.slice(0, 40);
}

export async function folderStatus(c: ImapFlow, path: string) {
	const s = await c.status(path, { uidValidity: true, uidNext: true, messages: true });
	return { uidValidity: String(s.uidValidity ?? "0"), uidNext: Number(s.uidNext ?? 1), messages: Number(s.messages ?? 0) };
}

export interface ImapMetaItem {
	uid: number;
	flags: Set<string>;
	envelope: FetchMessageObject["envelope"];
	internalDate: Date | null;
	size: number;
	hasAttachments: boolean;
	/** First bytes of the source (headers + start of body) for References + snippet. */
	head: Buffer | null;
}

export function structureHasAttachments(node: MessageStructureObject | undefined): boolean {
	if (!node) return false;
	const disp = (node.disposition ?? "").toLowerCase();
	const filename = node.dispositionParameters?.filename ?? node.parameters?.name;
	if (disp === "attachment") return true;
	if (filename && !node.type?.startsWith("text/") && disp !== "inline") return true;
	return (node.childNodes ?? []).some(structureHasAttachments);
}

const HEAD_BYTES = 12_000;

export async function fetchMeta(c: ImapFlow, range: string): Promise<ImapMetaItem[]> {
	const out: ImapMetaItem[] = [];
	for await (const m of c.fetch(
		range,
		{ uid: true, flags: true, envelope: true, bodyStructure: true, internalDate: true, size: true, source: { start: 0, maxLength: HEAD_BYTES } },
		{ uid: true },
	)) {
		out.push({
			uid: Number(m.uid),
			flags: m.flags ?? new Set(),
			envelope: m.envelope,
			internalDate: m.internalDate ? new Date(m.internalDate) : null,
			size: Number(m.size ?? 0),
			hasAttachments: structureHasAttachments(m.bodyStructure),
			head: m.source ?? null,
		});
	}
	return out;
}

export async function fetchFlags(c: ImapFlow, range: string): Promise<Map<number, Set<string>>> {
	const out = new Map<number, Set<string>>();
	for await (const m of c.fetch(range, { uid: true, flags: true }, { uid: true })) {
		out.set(Number(m.uid), m.flags ?? new Set());
	}
	return out;
}

export async function fetchSource(c: ImapFlow, uid: number): Promise<Buffer | null> {
	const m = await c.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
	return m && m.source ? m.source : null;
}

export async function ensureFolder(c: ImapFlow, path: string): Promise<void> {
	try {
		await c.mailboxCreate(path);
	} catch {
		// already exists (or not allowed); moving into it will tell us
	}
}

export async function sendSmtp(cfg: ImapConfig, raw: Buffer, envelope: { from: string; to: string[] }): Promise<void> {
	await assertPublicHost(cfg.smtpHost);
	const transport = nodemailer.createTransport({
		host: cfg.smtpHost,
		port: cfg.smtpPort,
		secure: cfg.smtpPort === 465,
		requireTLS: cfg.useTls && cfg.smtpPort !== 465,
		ignoreTLS: !cfg.useTls,
		auth: { user: cfg.username, pass: cfg.password },
		connectionTimeout: 20_000,
		socketTimeout: 60_000,
	});
	try {
		await transport.sendMail({ envelope, raw });
	} finally {
		transport.close();
	}
}

export async function testConnection(cfg: ImapConfig): Promise<void> {
	await assertPublicHost(cfg.imapHost);
	await withImap(cfg, async () => undefined);
}
