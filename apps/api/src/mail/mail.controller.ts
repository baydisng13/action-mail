import { randomBytes } from "node:crypto";
import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
	Put,
	Query,
	Req,
	Res,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
	createDraftSchema,
	type DraftContent,
	draftContentSchema,
	type ImapConnectInput,
	imapConnectSchema,
	MAX_UPLOAD_BYTES,
	searchQuerySchema,
	type ThreadActionInput,
	threadActionSchema,
	type ThreadsQuery,
	updateMailboxSchema,
} from "@postscript/types";
import type { Request, Response } from "express";
import { AiService } from "../ai/ai.service";
import { Auth, type AuthCtx, Public } from "../common/auth";
import { clearCookie, CONNECT_STATE_COOKIE, setShortCookie } from "../common/cookies";
import { ApiError } from "../common/errors";
import { signStateToken, verifyStateToken } from "../common/jwt";
import { log } from "../common/logger";
import { ZBody, ZQuery } from "../common/zod.pipe";
import { env } from "../config/env";
import { QueueService } from "../queue/queue.service";
import { ActionsService } from "./actions.service";
import { verifyAttachmentSig } from "./body";
import { ComposeService } from "./compose.service";
import { buildConnectUrl } from "./gmail.client";
import { MailboxService, scopeOf, toSummary } from "./mailbox.service";
import { ReadService } from "./read.service";
import { SearchService } from "./search.service";

@Controller()
export class MailController {
	constructor(
		private readonly boxes: MailboxService,
		private readonly read: ReadService,
		private readonly actions: ActionsService,
		private readonly search: SearchService,
		private readonly compose: ComposeService,
		private readonly ai: AiService,
		private readonly queues: QueueService,
	) {}

	// ─── Mailboxes ──────────────────────────────────────────────────────────
	@Get("mailboxes")
	async list(@Auth() ctx: AuthCtx) {
		return { mailboxes: (await this.boxes.list(scopeOf(ctx))).map(toSummary) };
	}

	@Patch("mailboxes/:id")
	async update(@Auth() ctx: AuthCtx, @Param("id") id: string, @ZBody(updateMailboxSchema) body: { displayName?: string | null; signatureHtml?: string | null }) {
		return toSummary(await this.boxes.update(scopeOf(ctx), id, body));
	}

	@Delete("mailboxes/:id")
	async disconnect(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		await this.boxes.disconnect(scopeOf(ctx), id);
		return { ok: true };
	}

	@HttpCode(200)
	@Post("mailboxes/:id/sync")
	async sync(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		const m = await this.boxes.require(scopeOf(ctx), id);
		if (m.status === "ready") await this.queues.incremental(m.id);
		else await this.queues.backfill(m.id, m.syncedCount);
		return { ok: true };
	}

	/** Polled by the open app: queue a quick incremental sync of every mailbox. */
	@HttpCode(200)
	@Post("mailboxes/refresh")
	async refresh(@Auth() ctx: AuthCtx) {
		const list = await this.boxes.list(scopeOf(ctx));
		for (const m of list) {
			if (m.status === "ready" || m.status === "error") await this.queues.safe("incremental", () => this.queues.incremental(m.id));
		}
		return { queued: list.length };
	}

	@HttpCode(200)
	@Post("mailbox/google")
	async gmailConnect(@Auth() ctx: AuthCtx, @Res({ passthrough: true }) res: Response) {
		const state = await signStateToken({ sub: ctx.userId, org: ctx.orgId, nonce: randomBytes(12).toString("base64url") });
		const url = buildConnectUrl(state);
		setShortCookie(res, CONNECT_STATE_COOKIE, state, 600);
		return { url };
	}

	@Public()
	@Get("mailbox/google/callback")
	async gmailCallback(
		@Query("code") code: string | undefined,
		@Query("state") state: string | undefined,
		@Query("error") error: string | undefined,
		@Req() req: Request,
		@Res() res: Response,
	) {
		const app = env().APP_URL;
		const cookie = req.cookies?.[CONNECT_STATE_COOKIE];
		clearCookie(res, CONNECT_STATE_COOKIE);
		if (error) return res.redirect(302, `${app}/onboarding?error=denied`);
		if (!code || !state || state !== cookie) return res.redirect(302, `${app}/onboarding?error=state`);
		const claims = await verifyStateToken(state);
		if (!claims?.sub || !claims.org) return res.redirect(302, `${app}/onboarding?error=state`);
		try {
			await this.boxes.connectGmail({ userId: claims.sub, orgId: claims.org, code });
			return res.redirect(302, `${app}/app`);
		} catch (err) {
			log.warn("mailbox.gmail_connect_failed", { err: err as Error });
			const c = err instanceof ApiError ? err.code : undefined;
			return res.redirect(302, `${app}/onboarding?error=${c === "mailbox_limit" ? "limit" : "connect"}`);
		}
	}

	@Post("mailbox/imap")
	async imap(@Auth() ctx: AuthCtx, @ZBody(imapConnectSchema) body: ImapConnectInput) {
		const m = await this.boxes.connectImap(ctx, body);
		return { mailboxId: m.id };
	}

	@Get("folders")
	async folders(@Auth() ctx: AuthCtx, @Query("mailboxId") mailboxId?: string) {
		return { folders: await this.boxes.folders(scopeOf(ctx), mailboxId || undefined) };
	}

	// ─── Read ───────────────────────────────────────────────────────────────
	@Get("threads")
	threads(@Auth() ctx: AuthCtx, @Query() q: ThreadsQuery) {
		return this.read.listThreads(scopeOf(ctx), q);
	}

	@Get("search")
	doSearch(@Auth() ctx: AuthCtx, @ZQuery(searchQuerySchema) q: { q: string; from?: string; mailboxId?: string; unread?: boolean; starred?: boolean; attachments?: boolean }) {
		if (!q.q && !q.from) return { threads: [], hasMore: false };
		return this.search.search(scopeOf(ctx), q);
	}

	@Get("threads/:id")
	async thread(@Auth() ctx: AuthCtx, @Param("id") id: string, @Query("images") images?: string) {
		const detail = await this.read.getThread(scopeOf(ctx), id, { images: images === "1" || images === "true" });
		if (detail.unread) {
			await this.actions.apply(scopeOf(ctx), { threadIds: [id], action: "read" }).catch(() => undefined);
			detail.unread = false;
			for (const m of detail.messages) m.unread = false;
		}
		return detail;
	}

	@HttpCode(200)
	@Post("threads/actions")
	threadActions(@Auth() ctx: AuthCtx, @ZBody(threadActionSchema) body: ThreadActionInput) {
		return this.actions.apply(scopeOf(ctx), body);
	}

	@Get("threads/:id/ai/actions")
	async aiActions(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		return { actions: await this.ai.threadActions(scopeOf(ctx), id) };
	}

	@Get("threads/:id/ai/summary")
	async aiSummary(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		return { summaries: await this.ai.threadSummary(scopeOf(ctx), id) };
	}

	/** Signed link (no bearer: works in <img> and downloads). Streams from the provider. */
	@Public()
	@Get("attachments/:messageId/:attachmentId")
	async attachment(
		@Param("messageId") messageId: string,
		@Param("attachmentId") attachmentId: string,
		@Query("exp") exp: string,
		@Query("sig") sig: string,
		@Query("inline") inline: string | undefined,
		@Res() res: Response,
	) {
		if (!verifyAttachmentSig(messageId, attachmentId, Number(exp), sig)) {
			throw new ApiError(403, "This link has expired. Open the message again.", "link_expired");
		}
		const a = await this.read.attachmentContent(messageId, attachmentId);
		const safeInline = inline === "1" && /^image\/(png|jpe?g|gif|webp)$/i.test(a.mimeType);
		const name = a.filename.replace(/["\r\n]/g, "");
		res.setHeader("content-type", safeInline ? a.mimeType : a.mimeType || "application/octet-stream");
		res.setHeader("content-disposition", `${safeInline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
		res.setHeader("x-content-type-options", "nosniff");
		res.setHeader("content-security-policy", "sandbox; default-src 'none'");
		res.setHeader("cache-control", "private, no-store");
		res.setHeader("cross-origin-resource-policy", "cross-origin");
		res.send(a.content);
	}

	// ─── Compose ────────────────────────────────────────────────────────────
	@Post("drafts")
	createDraft(@Auth() ctx: AuthCtx, @ZBody(createDraftSchema) body: { mailboxId?: string; mode: "new" | "reply" | "replyAll" | "forward" | "edit"; sourceMessageId?: string }) {
		return this.compose.create(ctx, body);
	}

	@Get("drafts/:id")
	getDraft(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		return this.compose.get(ctx, id);
	}

	@Put("drafts/:id")
	saveDraft(@Auth() ctx: AuthCtx, @Param("id") id: string, @ZBody(draftContentSchema) body: DraftContent) {
		return this.compose.save(ctx, id, body);
	}

	@Delete("drafts/:id")
	async deleteDraft(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		await this.compose.remove(ctx, id);
		return { ok: true };
	}

	@HttpCode(200)
	@Post("drafts/:id/send")
	send(@Auth() ctx: AuthCtx, @Param("id") id: string, @ZBody(draftContentSchema) body: DraftContent) {
		return this.compose.send(ctx, id, body);
	}

	@HttpCode(200)
	@Post("outbox/:id/undo")
	undo(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		return this.compose.undo(ctx, id);
	}

	@Post("uploads")
	@UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
	upload(@Auth() ctx: AuthCtx, @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
		return this.compose.upload(ctx, file);
	}
}
