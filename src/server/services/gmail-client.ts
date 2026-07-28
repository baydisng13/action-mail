import { serverEnv } from "@/env.server";
import { ApiError } from "@/server/lib/http";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// Read + modify (labels/archive) + the address of the connected account.
export const GMAIL_SCOPES = [
	"https://www.googleapis.com/auth/gmail.modify",
	"https://www.googleapis.com/auth/userinfo.email",
	"openid",
].join(" ");

function config() {
	const {
		GOOGLE_CLIENT_ID: clientId,
		GOOGLE_CLIENT_SECRET: clientSecret,
		GMAIL_CONNECT_REDIRECT_URI: redirectUri,
	} = serverEnv;
	if (!clientId || !clientSecret || !redirectUri) {
		throw new ApiError(
			503,
			"Gmail connect is not configured",
			"gmail_unconfigured",
		);
	}
	return { clientId, clientSecret, redirectUri };
}

export function isGmailConnectConfigured(): boolean {
	return Boolean(
		serverEnv.GOOGLE_CLIENT_ID &&
			serverEnv.GOOGLE_CLIENT_SECRET &&
			serverEnv.GMAIL_CONNECT_REDIRECT_URI,
	);
}

export function buildConnectUrl(state: string): string {
	const { clientId, redirectUri } = config();
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: GMAIL_SCOPES,
		access_type: "offline",
		include_granted_scopes: "true",
		prompt: "consent", // force a refresh_token every time
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

export async function exchangeCode(code: string): Promise<GmailTokens> {
	const { clientId, clientSecret, redirectUri } = config();
	const res = await fetch(TOKEN_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		}),
	});
	if (!res.ok) {
		throw new ApiError(401, "Gmail authorization failed", "gmail_exchange_failed");
	}
	const data = (await res.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in: number;
		scope?: string;
	};
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresAt: new Date(Date.now() + data.expires_in * 1000),
		scope: data.scope,
	};
}

export async function refreshTokens(refreshToken: string): Promise<GmailTokens> {
	const { clientId, clientSecret } = config();
	const res = await fetch(TOKEN_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "refresh_token",
		}),
	});
	if (!res.ok) {
		throw new ApiError(401, "Gmail token refresh failed", "gmail_refresh_failed");
	}
	const data = (await res.json()) as {
		access_token: string;
		expires_in: number;
		scope?: string;
	};
	return {
		accessToken: data.access_token,
		expiresAt: new Date(Date.now() + data.expires_in * 1000),
		scope: data.scope,
	};
}

async function gapi<T>(accessToken: string, path: string): Promise<T> {
	const res = await fetch(`${GMAIL_BASE}${path}`, {
		headers: { authorization: `Bearer ${accessToken}` },
	});
	if (res.status === 401) {
		throw new ApiError(401, "Gmail token expired", "gmail_token_expired");
	}
	if (!res.ok) {
		throw new ApiError(502, `Gmail API error ${res.status}`, "gmail_api_error");
	}
	return (await res.json()) as T;
}

export async function getProfile(
	accessToken: string,
): Promise<{ emailAddress: string; historyId?: string }> {
	const p = await gapi<{ emailAddress: string; historyId?: string }>(
		accessToken,
		"/profile",
	);
	return { emailAddress: p.emailAddress.toLowerCase(), historyId: p.historyId };
}

/** Message ids added since a history cursor (incremental / fetch-on-open). */
export async function listHistoryAdded(
	accessToken: string,
	startHistoryId: string,
): Promise<{ ids: string[]; historyId?: string }> {
	const params = new URLSearchParams({
		startHistoryId,
		historyTypes: "messageAdded",
		labelId: "INBOX",
	});
	const data = await gapi<{
		history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>;
		historyId?: string;
	}>(accessToken, `/history?${params}`);
	const ids = new Set<string>();
	for (const h of data.history ?? []) {
		for (const m of h.messagesAdded ?? []) ids.add(m.message.id);
	}
	return { ids: [...ids], historyId: data.historyId };
}

export interface MessageIdPage {
	ids: string[];
	nextPageToken?: string;
	estimate?: number;
}

/** List message ids in the inbox (paged). */
export async function listMessageIds(
	accessToken: string,
	opts: { pageToken?: string; max?: number } = {},
): Promise<MessageIdPage> {
	const params = new URLSearchParams({
		maxResults: String(opts.max ?? 25),
		q: "in:inbox",
	});
	if (opts.pageToken) params.set("pageToken", opts.pageToken);
	const data = await gapi<{
		messages?: Array<{ id: string }>;
		nextPageToken?: string;
		resultSizeEstimate?: number;
	}>(accessToken, `/messages?${params}`);
	return {
		ids: (data.messages ?? []).map((m) => m.id),
		nextPageToken: data.nextPageToken,
		estimate: data.resultSizeEstimate,
	};
}

export interface ParsedMessage {
	id: string;
	threadId: string;
	fromName?: string;
	fromAddress?: string;
	to: string[];
	subject?: string;
	snippet?: string;
	bodyText?: string;
	bodyHtml?: string;
	labels: string[];
	isUnread: boolean;
	internalDate?: Date;
}

interface GmailPayloadPart {
	mimeType?: string;
	body?: { data?: string };
	parts?: GmailPayloadPart[];
}

function decodeB64Url(data: string): string {
	return Buffer.from(data, "base64url").toString("utf8");
}

function extractPart(
	part: GmailPayloadPart | undefined,
	mime: string,
): string | undefined {
	if (!part) return undefined;
	if (part.mimeType === mime && part.body?.data) {
		return decodeB64Url(part.body.data);
	}
	if (part.parts) {
		for (const p of part.parts) {
			const t = extractPart(p, mime);
			if (t) return t;
		}
	}
	return undefined;
}

function parseFrom(header?: string): { name?: string; address?: string } {
	if (!header) return {};
	const m = header.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
	if (m) return { name: m[1].trim() || undefined, address: m[2].trim().toLowerCase() };
	return { address: header.trim().toLowerCase() };
}

export async function getMessage(
	accessToken: string,
	id: string,
): Promise<ParsedMessage> {
	const data = await gapi<{
		id: string;
		threadId: string;
		snippet?: string;
		labelIds?: string[];
		internalDate?: string;
		payload?: GmailPayloadPart & {
			headers?: Array<{ name: string; value: string }>;
		};
	}>(accessToken, `/messages/${id}?format=full`);

	const headers = data.payload?.headers ?? [];
	const h = (name: string) =>
		headers.find((x) => x.name.toLowerCase() === name)?.value;
	const from = parseFrom(h("from"));
	const to = (h("to") ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const labels = data.labelIds ?? [];

	return {
		id: data.id,
		threadId: data.threadId,
		fromName: from.name,
		fromAddress: from.address,
		to,
		subject: h("subject"),
		snippet: data.snippet,
		bodyText: extractPart(data.payload, "text/plain"),
		bodyHtml: extractPart(data.payload, "text/html"),
		labels,
		isUnread: labels.includes("UNREAD"),
		internalDate: data.internalDate
			? new Date(Number(data.internalDate))
			: undefined,
	};
}
