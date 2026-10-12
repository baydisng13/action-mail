import { Controller, Get, HttpCode, Param, Post, Put, UseGuards } from "@nestjs/common";
import { type SettingGroupId, settingsTestEmailSchema, settingsUpdateSchema } from "@postscript/types";
import { AllowSuspended, Auth, type AuthCtx, PlatformAdmin } from "../common/auth";
import { RateLimit, RateLimitGuard } from "../common/rate-limit";
import { ZBody } from "../common/zod.pipe";
import { PlatformSettingsService } from "./platform-settings.service";

@PlatformAdmin()
@AllowSuspended()
@UseGuards(RateLimitGuard)
@Controller("admin/settings")
export class PlatformSettingsController {
	constructor(private readonly settings: PlatformSettingsService) {}

	@Get()
	get() {
		return this.settings.get();
	}

	@HttpCode(200)
	@RateLimit("admin-settings-write", 30)
	@Put()
	update(@Auth() ctx: AuthCtx, @ZBody(settingsUpdateSchema) body: { updates: Record<string, string> }) {
		return this.settings.update(ctx.email, body.updates);
	}

	@HttpCode(200)
	@RateLimit("admin-settings-test", 30)
	@Post("test/:group")
	test(@Param("group") group: SettingGroupId, @ZBody(settingsTestEmailSchema) body: { testAddress?: string; testInput?: string }) {
		return this.settings.test(group, body.testAddress, body.testInput);
	}
}
