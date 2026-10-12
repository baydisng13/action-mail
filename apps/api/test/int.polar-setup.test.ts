import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { INestApplicationContext } from "@nestjs/common";
import { ApiError } from "../src/common/errors";
import { boot, shutdown, uniq } from "./helpers";

/**
 * Stateful fake Polar client: no network calls. Shared across tests in this
 * file so the second run of autoConfigure() sees what the first run created,
 * which is exactly what proves idempotency (no duplicates).
 */
const polarState = {
	products: [] as { id: string; metadata: Record<string, unknown>; prices: { id: string; price_amount: number }[] }[],
	webhooks: [] as { id: string; url: string; events: string[]; secret: string }[],
};
let nextId = 1;

vi.mock("@polar-sh/sdk/2026-10", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	createPolar: (opts: { accessToken: string }) => {
		if (opts.accessToken === "bad-token") {
			return {
				organizations: {
					list: async () => {
						const err = new Error("unauthorized") as Error & { statusCode: number };
						err.statusCode = 401;
						throw err;
					},
				},
			};
		}
		return {
			organizations: { list: async () => ({ items: [{ id: "org_fake_1" }] }) },
			products: {
				list: async (q: { metadata?: { plan?: string; interval?: string } }) => ({
					items: polarState.products.filter(
						(p) => p.metadata.plan === q.metadata?.plan && p.metadata.interval === q.metadata?.interval,
					),
				}),
				create: async (body: {
					metadata: Record<string, unknown>;
					prices: ({ amount_type: string; price_amount?: number; seat_tiers?: { tiers: { price_per_seat: number }[] } })[];
				}) => {
					const id = `prod_${nextId++}`;
					const priceAmount = body.prices[0].price_amount ?? body.prices[0].seat_tiers?.tiers[0]?.price_per_seat ?? 0;
					const product = { id, metadata: body.metadata, prices: [{ id: `price_${id}`, price_amount: priceAmount }] };
					polarState.products.push(product);
					return product;
				},
			},
			webhooks: {
				listWebhookEndpoints: async () => ({ items: polarState.webhooks }),
				createWebhookEndpoint: async (body: { url: string; events: string[] }) => {
					const w = { id: `wh_${nextId++}`, url: body.url, events: body.events, secret: `whsec_${nextId}` };
					polarState.webhooks.push(w);
					return w;
				},
				updateWebhookEndpoint: async (id: string, body: { events?: string[] }) => {
					const w = polarState.webhooks.find((x) => x.id === id);
					if (!w) throw new Error("not found");
					if (body.events) w.events = body.events;
					return w;
				},
			},
		};
	},
}));

const { PolarSetupService } = await import("../src/billing/polar-setup.service");
const { PlatformSettingsService } = await import("../src/admin/platform-settings.service");

let app: INestApplicationContext;
beforeAll(async () => {
	app = await boot();
});
afterAll(shutdown);

describe("Polar self-serve setup", () => {
	const actor = `polar-${uniq()}@test.example`;

	it("refuses to run without a saved access token", async () => {
		const svc = app.get(PolarSetupService);
		await expect(svc.autoConfigure(actor)).rejects.toBeInstanceOf(ApiError);
	});

	it("rejects a bad token with a readable message", async () => {
		const settings = app.get(PlatformSettingsService);
		await settings.update(actor, { POLAR_ACCESS_TOKEN: "bad-token", POLAR_SERVER: "sandbox" });
		const svc = app.get(PolarSetupService);
		await expect(svc.autoConfigure(actor)).rejects.toThrow(/rejected this access token/i);
		await settings.update(actor, { POLAR_ACCESS_TOKEN: "", POLAR_SERVER: "" });
	});

	it("creates 4 products and a webhook, then reuses them on a second run", async () => {
		const settings = app.get(PlatformSettingsService);
		await settings.update(actor, { POLAR_ACCESS_TOKEN: "good-token-123456", POLAR_SERVER: "sandbox" });
		const svc = app.get(PolarSetupService);

		const first = await svc.autoConfigure(actor);
		expect(first.products).toHaveLength(4);
		expect(first.products.every((p) => p.reused === false)).toBe(true);
		expect(first.products.every((p) => p.productId)).toBe(true);
		expect(first.webhook.reused).toBe(false);
		expect(first.webhook.url).toMatch(/\/api\/billing\/webhook$/);

		const afterFirst = await settings.get();
		const pm = afterFirst.items.find((i) => i.key === "POLAR_PRODUCT_PRO_MONTHLY");
		expect(pm?.source).toBe("ui");
		expect(pm?.value).toBe(first.products.find((p) => p.plan === "pro" && p.interval === "month")?.productId);
		const whSecret = afterFirst.items.find((i) => i.key === "POLAR_WEBHOOK_SECRET");
		expect(whSecret?.masked).toBeTruthy(); // stored, never shown in full
		expect(polarState.products).toHaveLength(4);
		expect(polarState.webhooks).toHaveLength(1);

		const second = await svc.autoConfigure(actor);
		expect(second.products).toHaveLength(4);
		expect(second.products.every((p) => p.reused === true)).toBe(true);
		expect(second.webhook.reused).toBe(true);
		// No duplicates were created in Polar.
		expect(polarState.products).toHaveLength(4);
		expect(polarState.webhooks).toHaveLength(1);
		// Same ids as before.
		for (const p of second.products) {
			const before = first.products.find((f) => f.plan === p.plan && f.interval === p.interval);
			expect(p.productId).toBe(before?.productId);
		}
		expect(second.webhook.id).toBe(first.webhook.id);

		const status = await svc.status();
		expect(status.connected).toBe(true);
		expect(status.webhookConfigured).toBe(true);
		expect(status.products.filter((p) => p.productId)).toHaveLength(4);

		await settings.update(actor, {
			POLAR_ACCESS_TOKEN: "",
			POLAR_SERVER: "",
			POLAR_WEBHOOK_SECRET: "",
			POLAR_PRODUCT_PRO_MONTHLY: "",
			POLAR_PRODUCT_PRO_YEARLY: "",
			POLAR_PRODUCT_TEAM_MONTHLY: "",
			POLAR_PRODUCT_TEAM_YEARLY: "",
		});
	});
});
