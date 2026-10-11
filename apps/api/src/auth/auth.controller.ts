import { randomBytes } from "node:crypto";
import { Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
	changePasswordSchema,
	forgotPasswordSchema,
	type LoginInput,
	loginSchema,
	type RegisterInput,
	type RegisterResponse,
	registerSchema,
	resendVerificationSchema,
	resetPasswordSchema,
	verifyEmailSchema,
} from "@postscript/types";
import type { Request, Response } from "express";
import { Auth, type AuthCtx, Public } from "../common/auth";
import { ContentCache } from "../common/content-cache";
import {
	clearCookie,
	clearRefreshCookie,
	OAUTH_STATE_COOKIE,
	REFRESH_COOKIE,
	setRefreshCookie,
	setShortCookie,
} from "../common/cookies";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { RateLimit, RateLimitGuard } from "../common/rate-limit";
import { ZBody } from "../common/zod.pipe";
import { env } from "../config/env";
import { MailboxService } from "../mail/mailbox.service";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";

@Controller("auth")
@UseGuards(RateLimitGuard)
export class AuthController {
	constructor(
		private readonly auth: AuthService,
		private readonly sessions: SessionService,
		private readonly cache: ContentCache,
		private readonly boxes: MailboxService,
	) {}

	@Public()
	@RateLimit("register", 10)
	@Post("register")
	async register(@ZBody(registerSchema) body: RegisterInput, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<RegisterResponse> {
		const r = await this.auth.register(body, req.headers["user-agent"]);
		if (r.session) setRefreshCookie(res, r.session.refreshSecret);
		return { userId: r.userId, needsVerification: r.needsVerification, accessToken: r.session?.accessToken };
	}

	@Public()
	@RateLimit("login")
	@HttpCode(200)
	@Post("login")
	async login(@ZBody(loginSchema) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
		const s = await this.auth.login(body, req.headers["user-agent"]);
		setRefreshCookie(res, s.refreshSecret);
		return { accessToken: s.accessToken };
	}

	@Public()
	@RateLimit("refresh", 120)
	@HttpCode(200)
	@Post("refresh")
	async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
		const current = req.cookies?.[REFRESH_COOKIE];
		if (!current) throw new ApiError(401, "No session", "no_session");
		const s = await this.sessions.rotate(current, req.headers["user-agent"]);
		if (!s) {
			clearRefreshCookie(res);
			throw new ApiError(401, "Session expired", "session_expired");
		}
		setRefreshCookie(res, s.refreshSecret);
		return { accessToken: s.accessToken };
	}

	/** Logout also drops cached mail content for this user's mailboxes. */
	@Public()
	@HttpCode(200)
	@Post("logout")
	async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
		const current = req.cookies?.[REFRESH_COOKIE];
		if (current) {
			const userId = await this.sessions.userForRefresh(current);
			await this.sessions.revoke(current);
			if (userId) await this.purgeUserCache(userId);
		}
		clearRefreshCookie(res);
		return { ok: true };
	}

	private async purgeUserCache(userId: string) {
		try {
			const boxes = await this.boxes.allForUser(userId);
			for (const b of boxes) await this.cache.purgeMailbox(b.organizationId, b.id);
			for (const orgId of new Set(boxes.map((b) => b.organizationId))) await this.cache.purgeMailbox(orgId, `u-${userId}`);
		} catch (err) {
			log.warn("auth.logout_purge_failed", { err: err as Error });
		}
	}

	@Public()
	@RateLimit("verify")
	@HttpCode(200)
	@Post("verify-email")
	async verify(@ZBody(verifyEmailSchema) body: { token: string }) {
		await this.auth.verifyEmail(body.token);
		return { ok: true };
	}

	@Public()
	@RateLimit("resend", 5)
	@HttpCode(200)
	@Post("resend-verification")
	async resend(@ZBody(resendVerificationSchema) body: { email: string }) {
		await this.auth.resendVerification(body.email);
		return { ok: true };
	}

	@Public()
	@RateLimit("forgot", 5)
	@HttpCode(200)
	@Post("forgot-password")
	async forgot(@ZBody(forgotPasswordSchema) body: { email: string }) {
		await this.auth.forgotPassword(body.email);
		return { ok: true };
	}

	@Public()
	@RateLimit("reset")
	@HttpCode(200)
	@Post("reset-password")
	async reset(@ZBody(resetPasswordSchema) body: { token: string; password: string }) {
		await this.auth.resetPassword(body.token, body.password);
		return { ok: true };
	}

	@RateLimit("change-password", 10)
	@HttpCode(200)
	@Post("change-password")
	async changePassword(@Auth() ctx: AuthCtx, @ZBody(changePasswordSchema) body: { currentPassword?: string; newPassword: string }) {
		await this.auth.changePassword(ctx.userId, body.currentPassword, body.newPassword);
		return { ok: true };
	}

	@Public()
	@RateLimit("google")
	@Get("google")
	google(@Res() res: Response) {
		const state = randomBytes(16).toString("base64url");
		const url = this.auth.googleAuthUrl(state);
		setShortCookie(res, OAUTH_STATE_COOKIE, state);
		res.redirect(302, url);
	}

	@Public()
	@Get("google/callback")
	async googleCallback(
		@Query("code") code: string | undefined,
		@Query("state") state: string | undefined,
		@Query("error") error: string | undefined,
		@Req() req: Request,
		@Res() res: Response,
	) {
		const app = env().APP_URL;
		const expected = req.cookies?.[OAUTH_STATE_COOKIE];
		clearCookie(res, OAUTH_STATE_COOKIE);
		if (error) return res.redirect(302, `${app}/login?error=google_denied`);
		if (!code || !state || !expected || state !== expected) return res.redirect(302, `${app}/login?error=google_state`);
		try {
			const s = await this.auth.googleCallback(code, req.headers["user-agent"]);
			setRefreshCookie(res, s.refreshSecret);
			return res.redirect(302, `${app}/auth/continue`);
		} catch (err) {
			log.warn("auth.google_failed", { err: err as Error });
			return res.redirect(302, `${app}/login?error=google_failed`);
		}
	}
}
