import { Inject, Injectable } from "@nestjs/common";
import { createPolar } from "@polar-sh/sdk/2026-10";
import {
	PLANS,
	type BillingInterval,
	type PolarAutoConfigureResult,
	type PolarProductResult,
	type PolarStatus,
	type SettingKey,
} from "@postscript/types";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { env } from "../config/env";
import { DB, type Db } from "../db/db";
import { setting, writeSetting } from "../config/settings.store";

type PaidPlan = "pro" | "team";

/** The 4 products Postscript bills through Polar. */
const PRODUCT_PLANS: { plan: PaidPlan; interval: BillingInterval; settingKey: SettingKey }[] = [
	{ plan: "pro", interval: "month", settingKey: "POLAR_PRODUCT_PRO_MONTHLY" },
	{ plan: "pro", interval: "year", settingKey: "POLAR_PRODUCT_PRO_YEARLY" },
	{ plan: "team", interval: "month", settingKey: "POLAR_PRODUCT_TEAM_MONTHLY" },
	{ plan: "team", interval: "year", settingKey: "POLAR_PRODUCT_TEAM_YEARLY" },
];

/** Events the webhook handler (billing.service.ts) actually processes. */
const WEBHOOK_EVENTS = [
	"subscription.created",
	"subscription.updated",
	"subscription.active",
	"subscription.canceled",
	"subscription.revoked",
	"order.paid",
] as const;

const METADATA_APP = "postscript";

function amountCentsFor(plan: PaidPlan, interval: BillingInterval): number {
	const def = PLANS[plan];
	const usd = interval === "month" ? def.priceMonthly : def.priceYearly;
	return Math.round(usd * 100);
}

function productName(plan: PaidPlan, interval: BillingInterval): string {
	const label = plan === "pro" ? "Pro" : "Team";
	return `Postscript ${label} (${interval === "month" ? "monthly" : "yearly"})`;
}

function friendlyPolarError(err: unknown): never {
	const statusCode = (err as { statusCode?: number })?.statusCode;
	if (statusCode === 401 || statusCode === 403) {
		throw new ApiError(400, "Polar rejected this access token. Check it and the server (sandbox/production).", "polar_unauthorized");
	}
	if (typeof statusCode === "number" && statusCode >= 500) {
		throw new ApiError(502, "Polar is having trouble right now. Try again shortly.", "polar_unavailable");
	}
	const message = err instanceof Error ? err.message : "Unknown error talking to Polar.";
	throw new ApiError(502, `Polar API error: ${message}`, "polar_error");
}

@Injectable()
export class PolarSetupService {
	constructor(@Inject(DB) private readonly db: Db) {}

	private client() {
		const accessToken = setting("POLAR_ACCESS_TOKEN");
		if (!accessToken) throw new ApiError(400, "Paste a Polar organization access token first, then save.", "polar_not_connected");
		const server = (setting("POLAR_SERVER") ?? env().POLAR_SERVER ?? "sandbox") as "sandbox" | "production";
		return createPolar({ accessToken, environment: server, timeout: 30 });
	}

	async status(): Promise<PolarStatus> {
		const connected = Boolean(setting("POLAR_ACCESS_TOKEN"));
		const server = (setting("POLAR_SERVER") as "sandbox" | "production" | undefined) ?? null;
		const products = PRODUCT_PLANS.map(({ plan, interval, settingKey }) => ({
			plan,
			interval,
			key: settingKey,
			productId: setting(settingKey) ?? null,
			priceId: null,
			amountCents: amountCentsFor(plan, interval),
		}));
		return {
			connected,
			server,
			products,
			webhookConfigured: Boolean(setting("POLAR_WEBHOOK_SECRET")),
			webhookUrl: `${env().API_URL}/api/billing/webhook`,
		};
	}

	/** Idempotent: safe to run repeatedly ("Re-sync"). Reuses anything already tagged for Postscript. */
	async autoConfigure(actorEmail: string): Promise<PolarAutoConfigureResult> {
		const polar = this.client();
		const webhookUrl = `${env().API_URL}/api/billing/webhook`;

		let organizationId: string | null = null;
		try {
			const orgs = await polar.organizations.list({ limit: 1 });
			organizationId = orgs.items[0]?.id ?? null;
		} catch (err) {
			friendlyPolarError(err);
		}

		const products: PolarProductResult[] = [];
		for (const { plan, interval, settingKey } of PRODUCT_PLANS) {
			const result = await this.ensureProduct(polar, plan, interval);
			await writeSetting(this.db, settingKey, result.productId, actorEmail);
			products.push({ ...result, key: settingKey });
		}

		const webhook = await this.ensureWebhook(polar, webhookUrl);
		await writeSetting(this.db, "POLAR_WEBHOOK_SECRET", webhook.secret, actorEmail);

		log.info("admin.polar_auto_configure", {
			by: actorEmail,
			organizationId,
			products: products.map((p) => ({ plan: p.plan, interval: p.interval, productId: p.productId, reused: p.reused })),
			webhook: { id: webhook.id, reused: webhook.reused },
		});

		return {
			organizationId,
			products,
			webhook: { id: webhook.id, url: webhookUrl, reused: webhook.reused },
		};
	}

	private async ensureProduct(
		polar: ReturnType<PolarSetupService["client"]>,
		plan: PaidPlan,
		interval: BillingInterval,
	): Promise<Omit<PolarProductResult, "key">> {
		const amountCents = amountCentsFor(plan, interval);
		try {
			const existing = await polar.products.list({
				is_archived: false,
				metadata: { app: METADATA_APP, plan, interval } as unknown as Record<string, string>,
				limit: 1,
			});
			const found = existing.items[0];
			if (found) {
				const price = found.prices?.[0];
				return {
					plan,
					interval,
					productId: found.id,
					priceId: price?.id ?? null,
					amountCents: (price as { price_amount?: number })?.price_amount ?? amountCents,
					reused: true,
				};
			}

			const created = await polar.products.create({
				name: productName(plan, interval),
				recurring_interval: interval,
				metadata: { app: METADATA_APP, plan, interval },
				prices:
					plan === "team"
						? [
								{
									amount_type: "seat_based",
									seat_tiers: { tiers: [{ min_seats: 1, max_seats: null, price_per_seat: amountCents }] },
								},
							]
						: [{ amount_type: "fixed", price_amount: amountCents }],
			} as Parameters<typeof polar.products.create>[0]);
			const price = created.prices?.[0];
			return { plan, interval, productId: created.id, priceId: price?.id ?? null, amountCents, reused: false };
		} catch (err) {
			friendlyPolarError(err);
		}
	}

	private async ensureWebhook(
		polar: ReturnType<PolarSetupService["client"]>,
		url: string,
	): Promise<{ id: string; secret: string; reused: boolean }> {
		try {
			const existing = await polar.webhooks.listWebhookEndpoints({ limit: 100 });
			const found = existing.items.find((w) => w.url === url);
			if (found) {
				const updated =
					JSON.stringify([...found.events].sort()) === JSON.stringify([...WEBHOOK_EVENTS].sort())
						? found
						: await polar.webhooks.updateWebhookEndpoint(found.id, { events: [...WEBHOOK_EVENTS] });
				return { id: updated.id, secret: updated.secret, reused: true };
			}
			const created = await polar.webhooks.createWebhookEndpoint({
				url,
				name: "Postscript",
				format: "raw",
				events: [...WEBHOOK_EVENTS],
			});
			return { id: created.id, secret: created.secret, reused: false };
		} catch (err) {
			friendlyPolarError(err);
		}
	}
}
