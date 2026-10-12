import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import { PLANS, type PlanId } from "@postscript/types";
import { newId } from "../db/schema";
import { ApiError } from "../common/errors";
import { env, usdToEtb } from "../config/env";
import { PaymentsService } from "./payments.service";

const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

/** Manual proof fallback: customer uploads a screenshot/reference, an admin decides. */
@Injectable()
export class ManualPaymentsService {
	constructor(private readonly payments: PaymentsService) {}

	priceEtb(plan: Exclude<PlanId, "free">, periodMonths: number): number {
		return Math.round(PLANS[plan].priceMonthly * periodMonths * usdToEtb());
	}

	async submit(
		orgId: string,
		userId: string,
		plan: Exclude<PlanId, "free">,
		periodMonths: number,
		note: string | undefined,
		file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
	): Promise<{ id: string }> {
		if (!file) throw new ApiError(400, "Attach a screenshot or file as proof of payment.", "proof_required");
		if (file.size > MAX_PROOF_BYTES) throw new ApiError(413, "That file is too big. The limit is 8 MB.", "too_large");
		if (!ALLOWED_MIME.has(file.mimetype)) throw new ApiError(400, "Use a PNG, JPEG, WEBP or PDF file.", "bad_file_type");

		const dir = env().PAYMENT_PROOFS_DIR;
		await mkdir(dir, { recursive: true });
		const ext = file.mimetype === "application/pdf" ? "pdf" : file.mimetype.split("/")[1];
		const key = `${newId()}.${ext}`;
		await writeFile(join(dir, key), file.buffer);

		const amountEtb = this.priceEtb(plan, periodMonths);
		const row = await this.payments.createPending({
			organizationId: orgId,
			userId,
			method: "manual",
			plan,
			periodMonths,
			amountMinor: amountEtb * 100,
			currency: "etb",
			note,
			proofFileKey: key,
		});
		return { id: row.id };
	}
}
