import type { Address } from "@postscript/types";
import MailComposer from "nodemailer/lib/mail-composer";

/** "Re: Fwd: RE: Hello" -> "hello". Used for reply threading fallback. */
export function normalizeSubject(subject: string | null | undefined): string {
	let s = (subject ?? "").trim();
	const prefix = /^(re|fw|fwd|aw|wg|sv|vs|tr|rv|antw)(\[\d+\])?\s*:\s*/i;
	while (prefix.test(s)) s = s.replace(prefix, "");
	return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isReplySubject(subject: string | null | undefined): boolean {
	return /^(re|fw|fwd|aw|sv|antw)(\[\d+\])?\s*:/i.test((subject ?? "").trim());
}

/** Strip <> and whitespace from a Message-ID. */
export function cleanMessageId(id: string | null | undefined): string | null {
	if (!id) return null;
	const m = id.trim().match(/<?([^<>\s]+)>?/);
	return m ? m[1] : null;
}

/** Parse a References / In-Reply-To header value into clean ids. */
export function parseReferences(value: string | string[] | null | undefined): string[] {
	if (!value) return [];
	const raw = Array.isArray(value) ? value.join(" ") : value;
	const ids = raw.match(/<[^<>]+>/g) ?? raw.split(/\s+/);
	return ids.map(cleanMessageId).filter((x): x is string => Boolean(x));
}

/**
 * Pick the thread key for a message that has no provider thread id (IMAP).
 * Candidates are tried in order by the caller against existing messages:
 * first the parents it references, then its own id.
 */
export function threadCandidates(input: {
	messageId: string | null;
	inReplyTo: string | null;
	references: string[];
}): { lookups: string[]; fallbackKey: string | null } {
	const refs = [...input.references];
	if (input.inReplyTo && !refs.includes(input.inReplyTo)) refs.push(input.inReplyTo);
	// Root first (most stable), then nearest parent.
	const lookups = refs.length ? [refs[0], ...refs.slice(1).reverse()] : [];
	return { lookups: [...new Set(lookups)], fallbackKey: refs[0] ?? input.messageId };
}

/** Parse "Name <a@b>" / "a@b" lists (header strings) into addresses. */
export function parseAddressList(header: string | null | undefined): Address[] {
	if (!header) return [];
	const out: Address[] = [];
	// split on commas not inside quotes
	const parts = header.match(/(?:"[^"]*"|[^,])+/g) ?? [];
	for (const part of parts) {
		const p = part.trim();
		if (!p) continue;
		const m = p.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
		if (m) out.push({ name: m[1].trim() || null, address: m[2].trim().toLowerCase() });
		else if (p.includes("@")) out.push({ name: null, address: p.replace(/[<>]/g, "").trim().toLowerCase() });
	}
	return out;
}

export function formatAddress(a: Address): string {
	return a.name ? `${a.name} <${a.address}>` : a.address;
}

export function displayName(a: Address | null | undefined): string {
	if (!a) return "Unknown";
	return a.name || a.address.split("@")[0];
}

/** Plain-text preview from text or HTML. */
export function makeSnippet(text: string | null | undefined, html?: string | null, max = 180): string {
	let t = text ?? "";
	if (!t.trim() && html) {
		t = html
			.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">");
	}
	// drop quoted reply lines
	t = t
		.split("\n")
		.filter((l) => !l.trim().startsWith(">"))
		.join(" ");
	return t.replace(/\s+/g, " ").trim().slice(0, max);
}

export function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function textToHtml(text: string): string {
	return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

export function htmlToText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
		.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export interface OutgoingAttachment {
	filename: string;
	contentType: string;
	content: Buffer;
}

export interface OutgoingMessage {
	from: Address;
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	html: string;
	inReplyTo?: string | null;
	references?: string[];
	attachments: OutgoingAttachment[];
	messageId?: string;
	/** Keep Bcc header in the raw message (drafts and Gmail API need it). */
	keepBcc?: boolean;
}

/** Build an RFC 822 message (Buffer) with nodemailer's composer. */
export async function buildMime(msg: OutgoingMessage): Promise<Buffer> {
	const composer = new MailComposer({
		from: formatAddress(msg.from),
		to: msg.to,
		cc: msg.cc.length ? msg.cc : undefined,
		bcc: msg.bcc.length ? msg.bcc : undefined,
		subject: msg.subject,
		html: msg.html,
		text: htmlToText(msg.html),
		inReplyTo: msg.inReplyTo ? `<${msg.inReplyTo}>` : undefined,
		references: msg.references?.length ? msg.references.map((r) => `<${r}>`).join(" ") : undefined,
		messageId: msg.messageId ? `<${msg.messageId}>` : undefined,
		attachments: msg.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content })),
	});
	const mail = composer.compile();
	if (msg.keepBcc) (mail as unknown as { keepBcc: boolean }).keepBcc = true;
	return new Promise((resolve, reject) => {
		mail.build((err, buf) => (err ? reject(err) : resolve(buf)));
	});
}

export function replySubject(subject: string | null | undefined): string {
	const s = (subject ?? "").trim();
	return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

export function forwardSubject(subject: string | null | undefined): string {
	const s = (subject ?? "").trim();
	return /^(fwd?|fw)\s*:/i.test(s) ? s : `Fwd: ${s}`;
}

/** Recipients for reply-all: everyone except me, deduped. */
export function replyAllRecipients(input: {
	me: string;
	from: Address | null;
	replyTo: Address | null;
	to: Address[];
	cc: Address[];
}): { to: string[]; cc: string[] } {
	const me = input.me.toLowerCase();
	const seen = new Set<string>([me]);
	const take = (list: Array<Address | null>) => {
		const out: string[] = [];
		for (const a of list) {
			if (!a) continue;
			const addr = a.address.toLowerCase();
			if (seen.has(addr)) continue;
			seen.add(addr);
			out.push(addr);
		}
		return out;
	};
	const primary = input.replyTo ?? input.from;
	const fromIsMe = primary?.address.toLowerCase() === me;
	// Replying to my own sent message: answer the original recipients.
	const to = fromIsMe ? take(input.to) : take([primary, ...input.to]);
	const cc = take(input.cc);
	return { to, cc };
}
