import { createHmac, timingSafeEqual } from "node:crypto";
import { simpleParser } from "mailparser";
import { env } from "../config/env";
import type { AttachmentMeta } from "../db/schema";
import type { GmailPart } from "./gmail.client";
import { header } from "./gmail.client";
import { cleanMessageId, parseReferences } from "./mime";

/** A message body as fetched live from the provider. Lives in memory / encrypted cache only. */
export interface LiveBody {
	html: string | null;
	text: string | null;
	attachments: AttachmentMeta[];
	references: string[];
	messageId: string | null;
}

function decodeData(data?: string): string | null {
	return data ? Buffer.from(data, "base64url").toString("utf8") : null;
}

/** Walk a Gmail payload: first text/plain + text/html, everything with a filename is an attachment. */
export function parseGmailPayload(payload: GmailPart | undefined): LiveBody {
	let html: string | null = null;
	let text: string | null = null;
	const attachments: AttachmentMeta[] = [];
	const walk = (p: GmailPart | undefined) => {
		if (!p) return;
		const mime = (p.mimeType ?? "").toLowerCase();
		const disposition = (header(p, "Content-Disposition") ?? "").toLowerCase();
		const contentId = cleanMessageId(header(p, "Content-ID"));
		const isFile = Boolean(p.filename) || disposition.startsWith("attachment") || (contentId && mime.startsWith("image/"));
		if (isFile && !mime.startsWith("multipart/")) {
			attachments.push({
				id: `a${attachments.length}`,
				filename: p.filename || `attachment-${attachments.length + 1}`,
				mimeType: mime || "application/octet-stream",
				size: p.body?.size ?? 0,
				contentId,
				inline: Boolean(contentId) && !disposition.startsWith("attachment"),
				providerRef: p.body?.attachmentId ?? (p.partId ? `part:${p.partId}` : null),
			});
			return;
		}
		if (mime === "text/html" && html === null) html = decodeData(p.body?.data);
		else if (mime === "text/plain" && text === null) text = decodeData(p.body?.data);
		for (const c of p.parts ?? []) walk(c);
	};
	walk(payload);
	return {
		html,
		text,
		attachments,
		references: parseReferences(header(payload, "References")),
		messageId: cleanMessageId(header(payload, "Message-ID")),
	};
}

export function findGmailPart(payload: GmailPart | undefined, partId: string): GmailPart | null {
	if (!payload) return null;
	if (payload.partId === partId) return payload;
	for (const c of payload.parts ?? []) {
		const hit = findGmailPart(c, partId);
		if (hit) return hit;
	}
	return null;
}

export interface ParsedSource extends LiveBody {
	contents: Buffer[];
	subject: string | null;
	to: string[];
	cc: string[];
	bcc: string[];
}

/** Parse a raw RFC 822 source (IMAP, Gmail raw) into body + attachments. */
export async function parseSource(source: Buffer): Promise<ParsedSource> {
	const p = await simpleParser(source, { skipTextLinks: true });
	const list = (v: unknown): string[] => {
		const arr = Array.isArray(v) ? v : v ? [v] : [];
		return arr.flatMap((a: { value?: Array<{ address?: string }> }) => (a.value ?? []).map((x) => x.address ?? "")).filter(Boolean);
	};
	return {
		html: typeof p.html === "string" ? p.html : null,
		text: p.text ?? null,
		attachments: p.attachments.map((a, i) => ({
			id: `a${i}`,
			filename: a.filename || `attachment-${i + 1}`,
			mimeType: a.contentType || "application/octet-stream",
			size: a.size ?? a.content.length,
			contentId: cleanMessageId(a.contentId ?? null),
			inline: a.contentDisposition === "inline" && Boolean(a.contentId),
			providerRef: null,
		})),
		contents: p.attachments.map((a) => a.content),
		references: parseReferences(p.references as string | string[] | undefined),
		messageId: cleanMessageId(p.messageId ?? null),
		subject: p.subject ?? null,
		to: list(p.to),
		cc: list(p.cc),
		bcc: list(p.bcc),
	};
}

// ─── Signed attachment URLs ──────────────────────────────────────────────────
function sign(messageId: string, attachmentId: string, exp: number): string {
	return createHmac("sha256", env().JWT_ACCESS_SECRET).update(`att.${messageId}.${attachmentId}.${exp}`).digest("base64url");
}

export function attachmentUrl(messageId: string, attachmentId: string, ttlSec = 3600): string {
	const exp = Math.floor(Date.now() / 1000) + ttlSec;
	return `${env().API_URL}/api/attachments/${messageId}/${attachmentId}?exp=${exp}&sig=${sign(messageId, attachmentId, exp)}`;
}

export function verifyAttachmentSig(messageId: string, attachmentId: string, exp: number, sig: string): boolean {
	if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
	const want = Buffer.from(sign(messageId, attachmentId, exp));
	const got = Buffer.from(sig ?? "");
	return want.length === got.length && timingSafeEqual(want, got);
}
