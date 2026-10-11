import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { adminGrantSchema, adminSuspendSchema, type PlanId } from "@postscript/types";
import { AllowSuspended, Auth, type AuthCtx, PlatformAdmin } from "../common/auth";
import { ZBody } from "../common/zod.pipe";
import { AdminService } from "./admin.service";

@PlatformAdmin()
@AllowSuspended()
@Controller("admin")
export class AdminController {
	constructor(private readonly admin: AdminService) {}

	@Get("overview")
	overview() {
		return this.admin.overview();
	}

	@Get("orgs")
	orgs(@Query("q") q?: string) {
		return this.admin.orgs(q?.slice(0, 100));
	}

	@Get("users")
	users(@Query("q") q?: string) {
		return this.admin.users(q?.slice(0, 100));
	}

	@HttpCode(200)
	@Post("orgs/:id/grant")
	grant(@Auth() ctx: AuthCtx, @Param("id") id: string, @ZBody(adminGrantSchema) body: { plan: PlanId | null; seats?: number }) {
		return this.admin.grant(ctx.email, id, body.plan, body.seats);
	}

	@HttpCode(200)
	@Post("orgs/:id/suspend")
	async suspend(@Auth() ctx: AuthCtx, @Param("id") id: string, @ZBody(adminSuspendSchema) body: { suspended: boolean; reason?: string }) {
		await this.admin.suspend(ctx.email, id, body.suspended, body.reason);
		return { ok: true };
	}
}
