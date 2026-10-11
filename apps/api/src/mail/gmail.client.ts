import { env, gmailRedirectUri } from "../config/env";
import { ApiError } from "../common/errors";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPES = [
	"https://www.googleapis.com/auth/gmail.modify",
	"https://www.googleapis.com/auth/userinfo.email",
	"openid",
].join(" ");

function oauth() {
	const e = env();
	if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
		throw new ApiError(503, "Gmail is not configured yet", "gmail_unconfigured");
	}
	return { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, redirectUri: gmailRedirectUri() };
}

export function buildConnectUrl(state: string): string {
	const { clientId, redirectUri } = oauth();
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: GMAIL_SCOPES,
		access_type: "offline",
		include_granted_scopes: "true",
		prompt: "consent",
		state,
	});
	return `${AUTH_ENDPOINT}?${params}`;
}

export interface GmailTokens {
	accessToken: string;
	refreshToken?: string;
	expiresAt: Date;
	scope?: string;
}

async function tokenRequest(body: Record<string, string>, code: string): Promise<GmailTokens> {
	const res = await fetch(TOKEN_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body),
	});
	if (!res.ok) throw new ApiError(401, "Gmail authorization failed. Please reconnect.", code);
	const d = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
	return {
		accessToken: d.access_token,
		refreshToken: d.refresh_token,
		expiresAt: new Date(Date.now() + d.expires_in * 1000),
		scope: d.scope,
	};
}

export function exchangeCode(code: string) {
	const o = oauth();
	return tokenRequest(
		{ code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: "authorization_code" },
		"gmail_exchange_failed",
	);
}

export function refreshAccess(refreshToken: string) {
	const o = oauth();
	return tokenRequest(
		{ refresh_token: refreshToken, client_id: o.clientId, client_secret: o.clientSecret, grant_type: "refresh_token" },
		"mailbox_reauth",
	);
}

export class GmailHttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

async function gapi<T>(token: string, path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${GMAIL}${path}`, {
		...init,
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
	});
	if (res.status === 204) return undefined as T;
	if (!res.ok) {
		throw new GmailHttpError(res.status, `Gmail API ${res.status} on ${path.split("?")[0].replace(/\/[A-Za-z0-9_-]{10,}/g, "/:id")}`);
	}
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

export async function getProfile(token: string) {
	const p = await gapi<{ emailAddress: string; historyId?: string; messagesTotal?: number }>(token, "/profile");
	return { emailAddress: p.emailAddress.toLowerCase(), historyId: p.historyId, messagesTotal: p.messagesTotal };
}

export interface GmailLabel {
	id: string;
	name: string;
	type: "system" | "user";
}

export async function listLabels(token: string): Promise<GmailLabel[]> {
	const d = await gapi<{ labels?: GmailLabel[] }>(token, "/labels");
	return d.labels ?? [];
}

export async function listMessageIds(
	token: string,
	opts: { pageToken?: string; max?: number; q?: string; includeSpamTrash?: boolean; labelIds?: string[] },
) {
	const params = new URLSearchParams({ maxResults: String(opts.max ?? 50) });
	if (opts.pageToken) params.set("pageToken", opts.pageToken);
	if (opts.q) params.set("q", opts.q);
	if (opts.includeSpamTrash) params.set("includeSpamTrash", "true");
	for (const l of opts.labelIds ?? []) params.append("labelIds", l);
	const d = await gapi<{ messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string; resultSizeEstimate?: number }>(
		token,
		`/messages?${params}`,
	);
	return { messages: d.messages ?? [], nextPageToken: d.nextPageToken, estimate: d.resultSizeEstimate };
}

export interface GmailPart {
	partId?: string;
	mimeType?: string;
	filename?: string;
	headers?: Array<{ name: string; value: string }>;
	body?: { data?: string; attachmentId?: string; size?: number };
	parts?: GmailPart[];
}

export interface GmailMessage {
	id: string;
	threadId: string;
	labelIds?: string[];
	snippet?: string;
	internalDate?: string;
	sizeEstimate?: number;
	historyId?: string;
	payload?: GmailPart;
	raw?: string;
}

const META_HEADERS = ["From", "To", "Cc", "Bcc", "Reply-To", "Subject", "Message-ID", "In-Reply-To", "References", "Date"];

export function getMessageMeta(token: string, id: string) {
	const params = new URLSearchParams({ format: "metadata" });
	for (const h of META_HEADERS) params.append("metadataHeaders", h);
	return gapi<GmailMessage>(token, `/messages/${id}?${params}`);
}

export function getMessageFull(token: string, id: string) {
	return gapi<GmailMessage>(token, `/messages/${id}?format=full`);
}

export function getMessageRaw(token: string, id: string) {
	return gapi<GmailMessage>(token, `/messages/${id}?format=raw`);
}

export async function getAttachment(token: string, messageId: string, attachmentId: string): Promise<Buffer> {
	const d = await gapi<{ data: string }>(token, `/messages/${messageId}/attachments/${attachmentId}`);
	return Buffer.from(d.data, "base64url");
}

export function modifyThread(token: string, threadId: string, add: string[], remove: string[]) {
	return gapi(token, `/threads/${threadId}/modify`, {
		method: "POST",
		body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
	});
}

export function modifyMessages(token: string, ids: string[], add: string[], remove: string[]) {
	if (!ids.length) return Promise.resolve();
	return gapi(token, "/messages/batchModify", {
		method: "POST",
		body: JSON.stringify({ ids, addLabelIds: add, removeLabelIds: remove }),
	});
}

export const trashThread = (token: string, id: string) => gapi(token, `/threads/${id}/trash`, { method: "POST" });
export const untrashThread = (token: string, id: string) => gapi(token, `/threads/${id}/untrash`, { method: "POST" });

export interface HistoryRecord {
	id: string;
	messagesAdded?: Array<{ message: GmailMessage }>;
	messagesDeleted?: Array<{ message: GmailMessage }>;
	labelsAdded?: Array<{ message: GmailMessage; labelIds: string[] }>;
	labelsRemoved?: Array<{ message: GmailMessage; labelIds: string[] }>;
}

export async function listHistory(token: string, startHistoryId: string, pageToken?: string) {
	const params = new URLSearchParams({ startHistoryId, maxResults: "500" });
	for (const t of ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]) params.append("historyTypes", t);
	if (pageToken) params.set("pageToken", pageToken);
	return gapi<{ history?: HistoryRecord[]; historyId?: string; nextPageToken?: string }>(token, `/history?${params}`);
}

export function sendRaw(token: string, raw: Buffer, threadId?: string | null) {
	return gapi<{ id: string; threadId: string }>(token, "/messages/send", {
		method: "POST",
		body: JSON.stringify({ raw: raw.toString("base64url"), threadId: threadId ?? undefined }),
	});
}

export function createDraft(token: string, raw: Buffer, threadId?: string | null) {
	return gapi<{ id: string; message: { id: string } }>(token, "/drafts", {
		method: "POST",
		body: JSON.stringify({ message: { raw: raw.toString("base64url"), threadId: threadId ?? undefined } }),
	});
}

export function updateDraft(token: string, draftId: string, raw: Buffer, threadId?: string | null) {
	return gapi<{ id: string; message: { id: string } }>(token, `/drafts/${draftId}`, {
		method: "PUT",
		body: JSON.stringify({ id: draftId, message: { raw: raw.toString("base64url"), threadId: threadId ?? undefined } }),
	});
}

export function getDraftRaw(token: string, draftId: string) {
	return gapi<{ id: string; message: GmailMessage }>(token, `/drafts/${draftId}?format=raw`);
}

export const deleteDraft = (token: string, draftId: string) => gapi(token, `/drafts/${draftId}`, { method: "DELETE" });

export async function findDraftIdForMessage(token: string, messageId: string): Promise<string | null> {
	let pageToken: string | undefined;
	for (let i = 0; i < 5; i++) {
		const params = new URLSearchParams({ maxResults: "100" });
		if (pageToken) params.set("pageToken", pageToken);
		const d = await gapi<{ drafts?: Array<{ id: string; message: { id: string } }>; nextPageToken?: string }>(
			token,
			`/drafts?${params}`,
		);
		const hit = d.drafts?.find((x) => x.message.id === messageId);
		if (hit) return hit.id;
		if (!d.nextPageToken) break;
		pageToken = d.nextPageToken;
	}
	return null;
}

export function header(part: GmailPart | undefined, name: string): string | undefined {
	return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Gmail system labels -> folder roles. */
export function gmailRoles(labelIds: string[]): string[] {
	const roles: string[] = [];
	if (labelIds.includes("INBOX")) roles.push("inbox");
	if (labelIds.includes("SENT")) roles.push("sent");
	if (labelIds.includes("DRAFT")) roles.push("drafts");
	if (labelIds.includes("SPAM")) roles.push("spam");
	if (labelIds.includes("TRASH")) roles.push("trash");
	if (!roles.length) roles.push("archive");
	return roles;
}

export const GMAIL_SYSTEM_FOLDERS: Array<{ id: string; name: string; role: string }> = [
	{ id: "INBOX", name: "Inbox", role: "inbox" },
	{ id: "SENT", name: "Sent", role: "sent" },
	{ id: "DRAFT", name: "Drafts", role: "drafts" },
	{ id: "__ARCHIVE", name: "Archive", role: "archive" },
	{ id: "SPAM", name: "Spam", role: "spam" },
	{ id: "TRASH", name: "Trash", role: "trash" },
];
