import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from "@nestjs/common";
import { acceptInviteSchema, createOrgSchema, inviteSchema, renameOrgSchema, switchOrgSchema, updateMemberSchema } from "@postscript/types";
import type { Request, Response } from "express";
import { SessionService } from "../auth/session.service";
import { AllowSuspended, Auth, type AuthCtx, Public, Roles } from "../common/auth";
import { setRefreshCookie } from "../common/cookies";
import { ZBody } from "../common/zod.pipe";
import { OrgsService } from "./orgs.service";

@Controller()
export class OrgsController {
	constructor(
		private readonly orgs: OrgsService,
		private readonly sessions: SessionService,
	) {}

	private async switchTo(ctx: AuthCtx, orgId: string, req: Request, res: Response) {
		const s = await this.sessions.issue(ctx.userId, orgId, req.headers["user-agent"]);
		setRefreshCookie(res, s.refreshSecret);
		return s;
	}

	@AllowSuspended()
	@Get("orgs")
	list(@Auth() ctx: AuthCtx) {
		return this.orgs.list(ctx.userId);
	}

	@AllowSuspended()
	@Post("orgs")
	async create(@Auth() ctx: AuthCtx, @ZBody(createOrgSchema) body: { name: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
		const org = await this.orgs.create(ctx, body.name);
		const s = await this.switchTo(ctx, org.id, req, res);
		return { organization: { id: org.id, name: org.name, slug: org.slug, isPersonal: false, role: "owner", plan: org.plan }, accessToken: s.accessToken };
	}

	@AllowSuspended()
	@HttpCode(200)
	@Post("orgs/switch")
	async switch(@Auth() ctx: AuthCtx, @ZBody(switchOrgSchema) body: { organizationId: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
		const s = await this.switchTo(ctx, body.organizationId, req, res);
		return { accessToken: s.accessToken, organizationId: s.orgId };
	}

	@Roles("owner", "admin")
	@Patch("orgs/current")
	async rename(@Auth() ctx: AuthCtx, @ZBody(renameOrgSchema) body: { name: string }) {
		await this.orgs.rename(ctx, body.name);
		return { ok: true };
	}

	@AllowSuspended()
	@Roles("owner")
	@Delete("orgs/current")
	async remove(@Auth() ctx: AuthCtx, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
		await this.orgs.remove(ctx);
		const s = await this.sessions.issue(ctx.userId, null, req.headers["user-agent"]);
		setRefreshCookie(res, s.refreshSecret);
		return { ok: true, accessToken: s.accessToken };
	}

	@Get("orgs/current/members")
	members(@Auth() ctx: AuthCtx) {
		return this.orgs.members(ctx);
	}

	@Roles("owner", "admin")
	@Post("orgs/current/invites")
	invite(@Auth() ctx: AuthCtx, @ZBody(inviteSchema) body: { email: string; role: "admin" | "member" }) {
		return this.orgs.invite(ctx, body.email, body.role);
	}

	@Roles("owner", "admin")
	@Delete("orgs/current/invites/:id")
	async revoke(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		await this.orgs.revokeInvite(ctx, id);
		return { ok: true };
	}

	@Roles("owner")
	@Patch("orgs/current/members/:userId")
	async role(@Auth() ctx: AuthCtx, @Param("userId") userId: string, @ZBody(updateMemberSchema) body: { role: "admin" | "member" }) {
		await this.orgs.updateRole(ctx, userId, body.role);
		return { ok: true };
	}

	@AllowSuspended()
	@Delete("orgs/current/members/:userId")
	async removeMember(@Auth() ctx: AuthCtx, @Param("userId") userId: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
		await this.orgs.removeMember(ctx, userId);
		if (userId === ctx.userId) {
			const s = await this.sessions.issue(ctx.userId, null, req.headers["user-agent"]);
			setRefreshCookie(res, s.refreshSecret);
			return { ok: true, accessToken: s.accessToken };
		}
		return { ok: true };
	}

	@Public()
	@Get("invites/:token")
	preview(@Param("token") token: string) {
		return this.orgs.preview(token);
	}

	@AllowSuspended()
	@HttpCode(200)
	@Post("invites/accept")
	async accept(@Auth() ctx: AuthCtx, @ZBody(acceptInviteSchema) body: { token: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
		const orgId = await this.orgs.accept(ctx.userId, body.token);
		const s = await this.switchTo(ctx, orgId, req, res);
		return { accessToken: s.accessToken, organizationId: orgId };
	}
}
