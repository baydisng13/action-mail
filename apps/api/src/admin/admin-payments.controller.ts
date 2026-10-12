import { Controller, Get, HttpCode, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { PaymentRow } from "@postscript/types";
import type { Response } from "express";
import { AllowSuspended, Auth, type AuthCtx, PlatformAdmin } from "../common/auth";
import { ApiError } from "../common/errors";
import { RateLimit, RateLimitGuard } from "../common/rate-limit";
import { PaymentsService } from "../payments/payments.service";

@PlatformAdmin()
@AllowSuspended()
@UseGuards(RateLimitGuard)
@Controller("admin/payments")
export class AdminPaymentsController {
	constructor(private readonly payments: PaymentsService) {}

	@Get()
	list(@Query("status") status?: string, @Query("method") method?: string): Promise<PaymentRow[]> {
		return this.payments.list({ status, method });
	}

	@HttpCode(200)
	@RateLimit("admin-payments-decide", 30)
	@Post(":id/approve")
	approve(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		return this.payments.decide(id, true, ctx.email);
	}

	@HttpCode(200)
	@RateLimit("admin-payments-decide", 30)
	@Post(":id/reject")
	reject(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		return this.payments.decide(id, false, ctx.email);
	}

	@Get(":id/proof")
	async proof(@Param("id") id: string, @Res() res: Response) {
		const path = await this.payments.proofPath(id);
		if (!path) throw new ApiError(404, "No proof on file for this payment", "not_found");
		res.sendFile(path);
	}
}
