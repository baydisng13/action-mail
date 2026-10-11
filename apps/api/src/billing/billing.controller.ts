import { Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { type CheckoutInput, checkoutSchema } from "@postscript/types";
import type { Request, Response } from "express";
import { AllowSuspended, Auth, type AuthCtx, Public, Roles } from "../common/auth";
import { log } from "../common/logger";
import { ZBody } from "../common/zod.pipe";
import { env } from "../config/env";
import { BillingService } from "./billing.service";
import { PolarWebhookUnknownTypeError, PolarWebhookVerificationError, verifyPolarWebhook } from "./polar";

@AllowSuspended()
@Controller("billing")
export class BillingController {
	constructor(private readonly billing: BillingService) {}

	@Get()
	summary(@Auth() ctx: AuthCtx) {
		return this.billing.summary(ctx);
	}

	@Roles("owner", "admin")
	@HttpCode(200)
	@Post("checkout")
	checkout(@Auth() ctx: AuthCtx, @ZBody(checkoutSchema) body: CheckoutInput) {
		return this.billing.checkout(ctx, body);
	}

	@Roles("owner", "admin")
	@HttpCode(200)
	@Post("portal")
	portal(@Auth() ctx: AuthCtx) {
		return this.billing.portal(ctx);
	}

	/**
	 * Polar webhook. Verify the signature against the raw body, store the
	 * event (idempotent by webhook-id) and hand it to the worker queue.
	 */
	@Public()
	@Post("webhook")
	async webhook(@Req() req: Request & { rawBody?: Buffer }, @Res() res: Response) {
		const secret = env().POLAR_WEBHOOK_SECRET;
		if (!secret) return res.status(503).json({ error: { message: "Billing is not configured yet", code: "billing_unconfigured" } });
		const headers = {
			"webhook-id": String(req.headers["webhook-id"] ?? ""),
			"webhook-timestamp": String(req.headers["webhook-timestamp"] ?? ""),
			"webhook-signature": String(req.headers["webhook-signature"] ?? ""),
		};
		const raw = req.rawBody ?? Buffer.from("");
		let event: { type: string };
		try {
			event = (await verifyPolarWebhook(raw, headers, secret)) as { type: string };
		} catch (err) {
			if (err instanceof PolarWebhookVerificationError) {
				log.warn("billing.webhook_bad_signature");
				return res.status(403).json({ error: { message: "Invalid signature", code: "bad_signature" } });
			}
			if (err instanceof PolarWebhookUnknownTypeError) return res.status(202).json({ ignored: true });
			return res.status(400).json({ error: { message: "Invalid payload", code: "bad_payload" } });
		}
		const r = await this.billing.acceptWebhook(headers["webhook-id"], event.type, event);
		log.info("billing.webhook_received", { type: event.type, duplicate: r.duplicate });
		return res.status(202).json({ received: true });
	}
}
