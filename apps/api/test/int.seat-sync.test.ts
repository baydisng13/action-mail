import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { INestApplicationContext } from "@nestjs/common";
import { eq } from "drizzle-orm";

// Mock only the Polar client factory; keep productFor / planForProduct real.
const updateMock = vi.fn(async () => ({ id: "sub_mock" }));
const checkoutMock = vi.fn(async (_input: { seats?: number; [k: string]: unknown }) => ({ url: "https://polar.test/checkout" }));
vi.mock("../src/billing/polar", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/billing/polar")>();
	return {
		...actual,
		polar: () => ({ subscriptions: { update: updateMock }, checkouts: { create: checkoutMock } }),
	};
});

import { BillingService } from "../src/billing/billing.service";
import { OrgsService } from "../src/orgs/orgs.service";
import { writeSetting } from "../src/config/settings.store";
import { memberships, subscriptions } from "../src/db/schema";
import { asMemberOf, boot, db, makeUser, refreshOrg, shutdown, uniq } from "./helpers";

let app: INestApplicationContext;

beforeAll(async () => {
	app = await boot();
	// features.billing() needs both settings present.
	await writeSetting(db(app), "POLAR_ACCESS_TOKEN", "polar_test_token", "tester@test.example");
	await writeSetting(db(app), "POLAR_WEBHOOK_SECRET", "whsec_test", "tester@test.example");
});
afterAll(async () => {
	await writeSetting(db(app), "POLAR_ACCESS_TOKEN", "", "tester@test.example");
	await writeSetting(db(app), "POLAR_WEBHOOK_SECRET", "", "tester@test.example");
	await shutdown();
});
beforeEach(() => updateMock.mockClear());

/** A non-personal Team workspace with a live USD (Polar) subscription. */
async function usdTeam(seats = 2) {
	const owner = await makeUser(app);
	const orgs = app.get(OrgsService);
	const org = await orgs.create(owner, "USD Team");
	const subId = `sub_${uniq()}`;
	await db(app).insert(subscriptions).values({
		organizationId: org.id,
		polarSubscriptionId: subId,
		polarCustomerId: "cus_1",
		productId: "prod_team",
		plan: "team",
		interval: "month",
		status: "active",
		seats,
		amountCents: 1200 * seats,
		currency: "usd",
		currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
		cancelAtPeriodEnd: false,
		sourceUpdatedAt: new Date(Date.now() - 60_000),
	});
	await app.get(BillingService).recomputePlan(org.id);
	const ctx = await refreshOrg(app, await asMemberOf(app, owner, org.id, "owner"));
	return { owner, org, subId, ctx };
}

describe("syncSeats (USD per-seat sync)", () => {
	it("pushes the quantity only when it differs, and is idempotent", async () => {
		const billing = app.get(BillingService);
		const { org, subId } = await usdTeam(2);

		// 1 member (owner), floor is 2, sub is 2 -> no change, no Polar call.
		await billing.syncSeats(org.id);
		expect(updateMock).not.toHaveBeenCalled();

		// Grow membership to 3 -> desired 3 differs from 2 -> one Polar call.
		for (let i = 0; i < 2; i++) {
			const m = await makeUser(app, `M${i}`);
			await db(app).insert(memberships).values({ userId: m.userId, organizationId: org.id, role: "member" });
		}
		await billing.syncSeats(org.id);
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(updateMock).toHaveBeenCalledWith(subId, { seats: 3, proration_behavior: "prorate" });
		const [after] = await db(app).select().from(subscriptions).where(eq(subscriptions.polarSubscriptionId, subId));
		expect(after.seats).toBe(3);

		// Second call with no membership change -> no further Polar call.
		await billing.syncSeats(org.id);
		expect(updateMock).toHaveBeenCalledTimes(1);
	});

	it("skips birr/synthetic packs and orgs with no active Polar sub", async () => {
		const billing = app.get(BillingService);
		// Birr pack (synthetic id) with plenty of members.
		const owner = await makeUser(app);
		const orgs = app.get(OrgsService);
		const org = await orgs.create(owner, "Birr Team");
		await db(app).insert(subscriptions).values({
			organizationId: org.id,
			polarSubscriptionId: `chapa_${uniq()}`,
			plan: "team",
			interval: null,
			status: "canceled",
			seats: 5,
			amountCents: 100000,
			currency: "etb",
			currentPeriodEnd: new Date(Date.now() + 90 * 86400_000),
			cancelAtPeriodEnd: true,
			sourceUpdatedAt: new Date(),
		});
		for (let i = 0; i < 3; i++) {
			const m = await makeUser(app, `B${i}`);
			await db(app).insert(memberships).values({ userId: m.userId, organizationId: org.id, role: "member" });
		}
		await billing.syncSeats(org.id);
		expect(updateMock).not.toHaveBeenCalled();

		// Free org, no sub at all.
		const free = await makeUser(app);
		await billing.syncSeats(free.orgId);
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("invite-accept bumps the quantity; member-remove lowers it; amounts are never rewritten", async () => {
		const billing = app.get(BillingService);
		const orgs = app.get(OrgsService);
		const { org, subId, ctx } = await usdTeam(2);
		const amountBefore = (await db(app).select().from(subscriptions).where(eq(subscriptions.polarSubscriptionId, subId)))[0].amountCents;

		// Pre-fill a second member so the sub (2) already matches the live count.
		const existing = await makeUser(app, "Existing");
		await db(app).insert(memberships).values({ userId: existing.userId, organizationId: org.id, role: "member" });

		// Oversell: invite a third beyond the 2 paid seats (allowed for USD Team).
		const invitee = await makeUser(app, "Invitee");
		const inv = await orgs.invite(ctx, invitee.email, "member");
		expect(inv.link).toContain("/invite/");
		const token = inv.link!.split("/invite/")[1];
		await orgs.accept(invitee.userId, token);
		expect(updateMock).toHaveBeenLastCalledWith(subId, { seats: 3, proration_behavior: "prorate" });

		// Remove a member -> back down to 2.
		updateMock.mockClear();
		await orgs.removeMember(ctx, existing.userId);
		expect(updateMock).toHaveBeenLastCalledWith(subId, { seats: 2, proration_behavior: "prorate" });

		// The stored charge amount was never retroactively changed.
		const [final] = await db(app).select().from(subscriptions).where(eq(subscriptions.polarSubscriptionId, subId));
		expect(final.amountCents).toBe(amountBefore);
	});
});

describe("Team checkout seat floor", () => {
	it("clamps a USD Team checkout to at least 2 seats", async () => {
		await writeSetting(db(app), "POLAR_PRODUCT_TEAM_MONTHLY", "prod_team_monthly", "tester@test.example");
		const orgs = app.get(OrgsService);
		const billing = app.get(BillingService);
		const owner = await makeUser(app);
		const org = await orgs.create(owner, "Checkout Team");
		const ctx = await refreshOrg(app, await asMemberOf(app, owner, org.id, "owner"));
		checkoutMock.mockClear();
		await billing.checkout(ctx, { plan: "team", interval: "month", seats: 1 });
		expect(checkoutMock).toHaveBeenCalledTimes(1);
		expect(checkoutMock.mock.calls[0][0].seats).toBeGreaterThanOrEqual(2);
		await writeSetting(db(app), "POLAR_PRODUCT_TEAM_MONTHLY", "", "tester@test.example");
	});
});
