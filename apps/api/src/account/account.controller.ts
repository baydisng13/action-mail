import { Controller, Get, HttpCode, Patch, Post, Res } from "@nestjs/common";
import { deleteAccountSchema, updateProfileSchema } from "@postscript/types";
import type { Response } from "express";
import { AllowSuspended, Auth, type AuthCtx } from "../common/auth";
import { clearRefreshCookie } from "../common/cookies";
import { ZBody } from "../common/zod.pipe";
import { AccountService } from "./account.service";

@AllowSuspended()
@Controller()
export class AccountController {
	constructor(private readonly account: AccountService) {}

	@Get("me")
	me(@Auth() ctx: AuthCtx) {
		return this.account.me(ctx);
	}

	@Patch("account/profile")
	async profile(@Auth() ctx: AuthCtx, @ZBody(updateProfileSchema) body: { fullName: string }) {
		await this.account.updateProfile(ctx.userId, body.fullName);
		return { ok: true };
	}

	@Get("account/export")
	async export(@Auth() ctx: AuthCtx, @Res() res: Response) {
		const data = await this.account.export(ctx.userId);
		res.setHeader("content-type", "application/json; charset=utf-8");
		res.setHeader("content-disposition", `attachment; filename="postscript-export-${new Date().toISOString().slice(0, 10)}.json"`);
		res.send(JSON.stringify(data, null, 2));
	}

	@HttpCode(200)
	@Post("account/delete")
	async remove(@Auth() ctx: AuthCtx, @ZBody(deleteAccountSchema) body: { password?: string }, @Res({ passthrough: true }) res: Response) {
		await this.account.deleteAccount(ctx, body.password);
		clearRefreshCookie(res);
		return { ok: true };
	}
}
