import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplicationContext } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AdminService } from "../src/admin/admin.service";
import { BillingService } from "../src/billing/billing.service";
import { organizations, webhookEvents } from "../src/db/schema";
import { boot, db, makeUser, shutdown, uniq } from "./helpers";

let app: INestApplicationContext;
beforeAll(async () => {
	app = await boot();
});
afterAll(shutdown);

const planOf = async (orgId: string) => (await db(app).select().from(organizations).where(eq(organizations.id, orgId)))[0];

function subEvent(type: string, orgId: string, data: Record<string, unknown>) {
	return {
		type,
		data: {
			id: "sub_" + orgId,
			status: "active",
			amount: 900,
			currency: "usd",
			recurring_interval: "month",
			current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
			cancel_at_period_end: false,
			ended_at: null,
			product_id: "prod_unknown",
			customer_id: "cus_1",
			metadata: { organization_id: orgId, plan: "pro" },
			customer: { id: "cus_1", external_id: orgId },
			...data,
		},
	};
}

describe("Polar webhook processing (via the worker path)", () => {
	it("subscription created -> Pro; duplicate delivery is a no-op", async () => {
		const u = await makeUser(app);
		const billing = app.get(BillingService);
		const id = `wh_${uniq()}`;
		const ev = subEvent("subscription.created", u.orgId, { modified_at: new Date().toISOString() });
		await billing.acceptWebhook(id, ev.type, ev);
		await billing.processEvent(id);
		expect((await planOf(u.orgId)).plan).toBe("pro");
		const again = await billing.acceptWebhook(id, ev.type, ev);
		expect(again.duplicate).toBe(true);
		await billing.processEvent(id);
		const [row] = await db(app).select().from(webhookEvents).where(eq(webhookEvents.id, id));
		expect(row.attempts).toBe(1);
	});

	it("older events never overwrite newer state; revoke drops to Free", async () => {
		const u = await makeUser(app);
		const billing = app.get(BillingService);
		const t0 = Date.now();
		const newer = subEvent("subscription.updated", u.orgId, { status: "active", seats: 4, metadata: { organization_id: u.orgId, plan: "team" }, modified_at: new Date(t0).toISOString() });
		const older = subEvent("subscription.updated", u.orgId, { status: "past_due", modified_at: new Date(t0 - 60_000).toISOString() });
		for (const [i, ev] of [newer, older].entries()) {
			const id = `wh_${uniq()}_${i}`;
			await billing.acceptWebhook(id, ev.type, ev);
			await billing.processEvent(id);
		}
		let org = await planOf(u.orgId);
		expect(org.plan).toBe("team");
		expect(org.seats).toBe(4);
		const revoked = subEvent("subscription.revoked", u.orgId, { status: "canceled", ended_at: new Date().toISOString(), modified_at: new Date(t0 + 1000).toISOString() });
		const id = `wh_${uniq()}`;
		await billing.acceptWebhook(id, revoked.type, revoked);
		await billing.processEvent(id);
		org = await planOf(u.orgId);
		expect(org.plan).toBe("free");
	});

	it("admin comp grant wins and can be removed", async () => {
		const u = await makeUser(app);
		const admin = app.get(AdminService);
		await admin.grant("boss@example.com", u.orgId, "team", 5);
		expect((await planOf(u.orgId)).plan).toBe("team");
		await admin.grant("boss@example.com", u.orgId, null);
		expect((await planOf(u.orgId)).plan).toBe("free");
		await admin.suspend("boss@example.com", u.orgId, true, "test");
		expect((await planOf(u.orgId)).suspendedAt).not.toBeNull();
		const ov = await admin.overview();
		expect(ov.orgs).toBeGreaterThan(0);
	});
});
