import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
	birrCheckoutSchema,
	manualProofSchema,
	type BirrCheckoutInput,
	type ManualProofInput,
	type PaymentOptionsResponse,
	telebirrSubmitSchema,
	type TelebirrSubmitInput,
} from "@postscript/types";
import type { Request, Response } from "express";
import { Auth, type AuthCtx, Public } from "../common/auth";
import { log } from "../common/logger";
import { RateLimit, RateLimitGuard } from "../common/rate-limit";
import { ZBody } from "../common/zod.pipe";
import { env, paymentMethods, usdToEtb } from "../config/env";
import { setting } from "../config/settings.store";
import { ChapaService } from "./chapa.service";
import { ManualPaymentsService } from "./manual.service";
import { TelebirrService } from "./telebirr.service";

@Controller("payments")
export class PaymentsController {
	constructor(
		private readonly chapa: ChapaService,
		private readonly telebirr: TelebirrService,
		private readonly manual: ManualPaymentsService,
	) {}

	@Public()
	@Get("options")
	options(@Req() req: Request): PaymentOptionsResponse {
		const country = (req.headers["cf-ipcountry"] as string | undefined)?.toUpperCase();
		return {
			usdToEtb: usdToEtb(),
			suggestedCurrency: country ? (country === "ET" ? "etb" : "usd") : "usd",
			methods: { polar: paymentMethods.polar(), chapa: paymentMethods.chapa(), telebirr: paymentMethods.telebirr(), manual: paymentMethods.manual() },
			telebirr: {
				merchantNumber: setting("TELEBIRR_MERCHANT_NUMBER") ?? null,
				merchantName: setting("TELEBIRR_MERCHANT_NAME") ?? null,
				instructions: setting("TELEBIRR_PAY_INSTRUCTIONS") ?? env().TELEBIRR_PAY_INSTRUCTIONS,
			},
		};
	}

	@UseGuards(RateLimitGuard)
	@RateLimit("chapa-init", 15)
	@HttpCode(200)
	@Post("chapa/init")
	async chapaInit(@Auth() ctx: AuthCtx, @ZBody(birrCheckoutSchema) body: BirrCheckoutInput) {
		const email = ctx.email;
		return this.chapa.initialize(ctx.orgId, ctx.userId, email, body.plan, body.periodMonths, body.seats);
	}

	/** Chapa posts here on every event. Verified by HMAC over the raw body. */
	@Public()
	@Post("chapa/webhook")
	async chapaWebhook(@Req() req: Request & { rawBody?: Buffer }, @Res() res: Response) {
		const raw = req.rawBody?.toString("utf8") ?? "";
		const sig = (req.headers["chapa-signature"] as string | undefined) ?? (req.headers["x-chapa-signature"] as string | undefined);
		if (!this.chapa.verifySignature(raw, sig)) {
			log.warn("chapa.webhook_bad_signature");
			return res.status(401).json({ error: { message: "Invalid signature", code: "invalid_signature" } });
		}
		const body = req.body as { tx_ref?: string; data?: { tx_ref?: string } };
		const txRef = body.tx_ref ?? body.data?.tx_ref;
		if (!txRef) return res.status(400).json({ error: { message: "Missing tx_ref", code: "invalid_input" } });
		await this.chapa.handleWebhook(txRef, body);
		res.status(200).json({ ok: true });
	}

	/** The customer lands here after checkout (return_url); also callable directly. */
	@Public()
	@Get("chapa/verify")
	chapaVerify(@Query("tx_ref") txRef: string) {
		if (!txRef) return { ok: false, message: "Missing tx_ref" };
		return this.chapa.verifyAndApply(txRef);
	}

	@UseGuards(RateLimitGuard)
	@RateLimit("telebirr-submit", 10)
	@HttpCode(200)
	@Post("telebirr/submit")
	telebirrSubmit(@Auth() ctx: AuthCtx, @ZBody(telebirrSubmitSchema) body: TelebirrSubmitInput) {
		return this.telebirr.submit(ctx.orgId, ctx.userId, body.plan, body.periodMonths, body.txnId, body.seats);
	}

	@UseGuards(RateLimitGuard)
	@RateLimit("manual-proof", 10)
	@HttpCode(200)
	@Post("manual/submit")
	@UseInterceptors(FileInterceptor("file", { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
	manualSubmit(
		@Auth() ctx: AuthCtx,
		@Body() rawBody: Record<string, string>,
		@UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
	) {
		const body = manualProofSchema.parse({
			...rawBody,
			periodMonths: Number(rawBody.periodMonths),
			...(rawBody.seats != null ? { seats: Number(rawBody.seats) } : {}),
		}) as ManualProofInput;
		return this.manual.submit(ctx.orgId, ctx.userId, body.plan, body.periodMonths, body.note, file, body.seats);
	}
}
