import { z } from "zod";

// ─── Mailbox connect ────────────────────────────────────────────────────────
export const imapConnectSchema = z.object({
	emailAddress: z.string().email(),
	imapHost: z.string().min(1, "Required"),
	imapPort: z.number().int().min(1).max(65535),
	smtpHost: z.string().min(1, "Required"),
	smtpPort: z.number().int().min(1).max(65535),
	useTls: z.boolean(),
	username: z.string().min(1, "Required"),
	password: z.string().min(1, "Required"),
});
export type ImapConnectInput = z.infer<typeof imapConnectSchema>;

export const updateMailboxSchema = z.object({
	displayName: z.string().max(120).nullable().optional(),
	signatureHtml: z.string().max(20_000).nullable().optional(),
});

export type MailboxProvider = "gmail" | "imap";
export type SyncStatus = "pending" | "syncing" | "ready" | "error";

export interface MailboxSummary {
	id: string;
	provider: MailboxProvider;
	emailAddress: string;
	displayName: string | null;
	signatureHtml: string | null;
	status: SyncStatus;
	syncedCount: number;
	totalEstimate: number | null;
	lastSyncedAt: string | null;
	error: string | null;
}

// ─── Folders / labels ───────────────────────────────────────────────────────
export const FOLDER_ROLES = ["inbox", "sent", "drafts", "archive", "spam", "trash", "all", "custom"] as const;
export type FolderRole = (typeof FOLDER_ROLES)[number];

export interface FolderView {
	/** Local folder id (use as `labelId` filter for custom folders). */
	id: string;
	mailboxId: string;
	name: string;
	role: FolderRole;
	unread: number;
}

// ─── Thread list ────────────────────────────────────────────────────────────
/** Virtual views. `label` needs `labelId` (a custom folder id). */
export const VIEWS = ["inbox", "starred", "snoozed", "sent", "drafts", "archive", "spam", "trash", "all", "label"] as const;
export type View = (typeof VIEWS)[number];

export const categorySchema = z.enum(["all", "primary", "promotions", "social", "updates"]);
export type Category = z.infer<typeof categorySchema>;

const boolParam = z
	.union([z.boolean(), z.enum(["1", "0", "true", "false"])])
	.transform((v) => v === true || v === "1" || v === "true")
	.optional();

export const threadsQuerySchema = z.object({
	view: z.enum(VIEWS).catch("inbox"),
	labelId: z.string().optional(),
	/** Omit for the unified view across all of your mailboxes. */
	mailboxId: z.string().optional(),
	category: categorySchema.catch("all"),
	unread: boolParam,
	starred: boolParam,
	attachments: boolParam,
	offset: z.coerce.number().int().min(0).catch(0),
	limit: z.coerce.number().int().min(1).max(100).catch(50),
});
export interface ThreadsQuery {
	view?: View;
	labelId?: string;
	mailboxId?: string;
	category?: Category;
	unread?: boolean | string;
	starred?: boolean | string;
	attachments?: boolean | string;
	offset?: number | string;
	limit?: number | string;
}

/**
 * Search runs on the provider (Gmail q= syntax, IMAP SEARCH), never on a local
 * copy of mail content. `from` adds a sender filter.
 */
export const searchQuerySchema = z.object({
	q: z.string().trim().max(300).default(""),
	from: z.string().trim().max(200).optional(),
	mailboxId: z.string().optional(),
	unread: boolParam,
	starred: boolParam,
	attachments: boolParam,
});

export interface Address {
	name: string | null;
	address: string;
}

export interface ThreadListItem {
	id: string;
	mailboxId: string;
	mailboxEmail: string;
	subject: string | null;
	snippet: string | null;
	lastMessageAt: string | null;
	messageCount: number;
	from: Address | null;
	/** Display names of everyone in the thread, newest first. */
	participants: string[];
	unread: boolean;
	starred: boolean;
	hasAttachments: boolean;
	hasDraft: boolean;
	roles: FolderRole[];
	/** Custom folder/label ids this thread is in. */
	labelIds: string[];
	category: Exclude<Category, "all">;
	snoozedUntil: string | null;
}

export interface ThreadListResponse {
	threads: ThreadListItem[];
	hasMore: boolean;
}

// ─── Thread detail (bodies fetched live from the provider) ──────────────────
export interface AttachmentView {
	id: string;
	filename: string;
	mimeType: string;
	size: number;
	inline: boolean;
	/** Signed, short-lived download URL (works in <img> and <a href>). */
	url: string;
}

export interface MessageView {
	id: string;
	from: Address | null;
	to: Address[];
	cc: Address[];
	bcc: Address[];
	replyTo: Address | null;
	subject: string | null;
	date: string | null;
	unread: boolean;
	starred: boolean;
	isDraft: boolean;
	roles: FolderRole[];
	/** Sanitized HTML (scripts, handlers, forms stripped; remote images blocked unless allowed). */
	html: string | null;
	text: string | null;
	/** True when remote images were blocked in `html`. */
	hasRemoteImages: boolean;
	attachments: AttachmentView[];
	/** Body could not be fetched (provider offline, message moved). */
	unavailable: boolean;
}

export interface ThreadDetail {
	id: string;
	mailboxId: string;
	mailboxEmail: string;
	provider: MailboxProvider;
	subject: string | null;
	starred: boolean;
	unread: boolean;
	roles: FolderRole[];
	labelIds: string[];
	snoozedUntil: string | null;
	messages: MessageView[];
}

// ─── Organize ───────────────────────────────────────────────────────────────
export const THREAD_ACTIONS = [
	"archive",
	"inbox",
	"trash",
	"restore",
	"delete",
	"spam",
	"notSpam",
	"read",
	"unread",
	"star",
	"unstar",
	"move",
	"addLabel",
	"removeLabel",
	"snooze",
	"unsnooze",
] as const;
export type ThreadAction = (typeof THREAD_ACTIONS)[number];

export const threadActionSchema = z.object({
	threadIds: z.array(z.string()).min(1).max(200),
	action: z.enum(THREAD_ACTIONS),
	/** Target folder id for move / addLabel / removeLabel. */
	folderId: z.string().optional(),
	/** ISO time for snooze. */
	until: z.string().datetime({ offset: true }).optional(),
});
export type ThreadActionInput = z.infer<typeof threadActionSchema>;

// ─── Compose ────────────────────────────────────────────────────────────────
export const COMPOSE_MODES = ["new", "reply", "replyAll", "forward", "edit"] as const;
export type ComposeMode = (typeof COMPOSE_MODES)[number];

const addressList = z.array(z.string().trim().email()).max(100).default([]);

export const createDraftSchema = z.object({
	mailboxId: z.string().optional(),
	mode: z.enum(COMPOSE_MODES).default("new"),
	/** The message being replied to / forwarded / edited (a draft message). */
	sourceMessageId: z.string().optional(),
});

export const draftContentSchema = z.object({
	mailboxId: z.string(),
	to: addressList,
	cc: addressList,
	bcc: addressList,
	subject: z.string().max(998).default(""),
	html: z.string().max(2_000_000).default(""),
	/** Upload ids from POST /api/uploads. */
	uploadIds: z.array(z.string()).max(20).default([]),
	/** Attachments kept from the source message (forward). */
	forwardAttachmentIds: z.array(z.string()).max(50).default([]),
});
export type DraftContent = z.infer<typeof draftContentSchema>;

export interface UploadView {
	id: string;
	filename: string;
	mimeType: string;
	size: number;
}

export interface DraftView {
	id: string;
	mode: ComposeMode;
	mailboxId: string;
	threadId: string | null;
	sourceMessageId: string | null;
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	html: string;
	uploads: UploadView[];
	/** Attachments carried over from the source message. */
	forwardAttachments: Array<{ id: string; filename: string; size: number }>;
	version: number;
	updatedAt: string;
}

export interface SendResponse {
	outboxId: string;
	sendAt: string;
	/** Seconds the user has to undo. */
	undoSeconds: number;
}

/** Max size of one upload and of all attachments on one message. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// ─── To-dos ─────────────────────────────────────────────────────────────────
export const createTodoSchema = z.object({
	title: z.string().trim().min(1, "Title is required").max(300),
	notes: z.string().max(5000).optional(),
	dueAt: z.string().nullable().optional(),
});

export const updateTodoSchema = z.object({
	status: z.enum(["open", "done"]).optional(),
	title: z.string().trim().min(1).max(300).optional(),
	notes: z.string().max(5000).nullable().optional(),
	dueAt: z.string().nullable().optional(),
});
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;

export interface TodoView {
	id: string;
	title: string;
	notes: string | null;
	dueAt: string | null;
	status: "open" | "done";
	source: "ai" | "manual";
	threadId: string | null;
	messageId: string | null;
	completedAt: string | null;
	createdAt: string;
}

// ─── AI ─────────────────────────────────────────────────────────────────────
export interface ExtractedAction {
	label: string;
	url: string;
	verb: "open" | "verify" | "reset" | "confirm" | "pay" | "view" | "track" | "download" | "unsubscribe";
	suspicious: boolean;
}
export interface ExtractionResult {
	isTransactional: boolean;
	otp: string | null;
	actions: ExtractedAction[];
	todo: { title: string; dueAt: string | null } | null;
	summary: string;
}
export interface MessageActions {
	messageId: string;
	result: ExtractionResult;
}
export interface MessageSummary {
	messageId: string;
	summary: string;
}
