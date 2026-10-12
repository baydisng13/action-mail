import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { INestApplication, INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { eq } from "drizzle-orm";
import { ChapaService } from "../src/payments/chapa.service";
import { TelebirrService } from "../src/payments/telebirr.service";
import { AppModule } from "../src/app.module";
import { signAccessToken } from "../src/common/jwt";
import { writeSetting } from "../src/config/settings.store";
import { memberships, payments, subscriptions, telebirrTransactions, users } from "../src/db/schema";
import { boot, db, makeUser, shutdown, uniq } from "./helpers";

let app: INestApplicationContext;
beforeAll(async () => {
	app = await boot();
});
afterAll(shutdown);
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Chapa webhook", () => {
	it("verifies the HMAC signature and rejects a bad one", async () => {
		const chapa = app.get(ChapaService);
		await writeSetting(db(app), "CHAPA_WEBHOOK_SECRET", "test-webhook-secret", "tester@test.example");
		const raw = JSON.stringify({ tx_ref: "abc", status: "success" });
		const { createHmac } = await import("node:crypto");
		const goodSig = createHmac("sha256", "test-webhook-secret").update(raw).digest("hex");
		expect(chapa.verifySignature(raw, goodSig)).toBe(true);
		expect(chapa.verifySignature(raw, "not-the-right-signature-00000000000000000000000000000000")).toBe(false);
		expect(chapa.verifySignature(raw, undefined)).toBe(false);
		await writeSetting(db(app), "CHAPA_WEBHOOK_SECRET", "", "tester@test.example");
	});

	it("is idempotent: the same tx_ref activates the plan only once", async () => {
		const chapa = app.get(ChapaService);
		const u = await makeUser(app);
		const [row] = await db(app)
			.insert(payments)
			.values({ organizationId: u.orgId, userId: u.userId, method: "chapa", plan: "pro", periodMonths: 1, amountMinor: 150300, currency: "etb", externalRef: `ps_${uniq()}` })
			.returning();
		await chapa.handleWebhook(row.externalRef as string, { tx_ref: row.externalRef, status: "success" });
		await chapa.handleWebhook(row.externalRef as string, { tx_ref: row.externalRef, status: "success" });
		const subs = await db(app).select().from(subscriptions).where(eq(subscriptions.organizationId, u.orgId));
		const local = subs.filter((s) => s.polarSubscriptionId === `chapa_${row.id}`);
		expect(local.length).toBe(1);
		const [paid] = await db(app).select().from(payments).where(eq(payments.id, row.id));
		expect(paid.status).toBe("paid");
	});
});

describe("Telebirr", () => {
	it("rejects a transaction id that was already used, even after a failed first attempt", async () => {
		const telebirr = app.get(TelebirrService);
		const u = await makeUser(app);
		await writeSetting(db(app), "TELEBIRR_RELAY_URL", "https://relay.test.example/fetch", "tester@test.example");
		await writeSetting(db(app), "TELEBIRR_RELAY_TOKEN", "test-token", "tester@test.example");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network unreachable in test");
			}),
		);
		const txnId = `txn_${uniq()}`;
		await expect(telebirr.submit(u.orgId, u.userId, "pro", 1, txnId)).rejects.toThrow();
		await expect(telebirr.submit(u.orgId, u.userId, "pro", 1, txnId)).rejects.toThrow(/already been used/);
		const rows = await db(app).select().from(telebirrTransactions).where(eq(telebirrTransactions.txnId, txnId));
		expect(rows.length).toBe(1);
		await writeSetting(db(app), "TELEBIRR_RELAY_URL", "", "tester@test.example");
		await writeSetting(db(app), "TELEBIRR_RELAY_TOKEN", "", "tester@test.example");
	});
});

describe("admin payments access", () => {
	let httpApp: INestApplication;
	let url: string;
	beforeAll(async () => {
		httpApp = await NestFactory.create(AppModule, { logger: false });
		httpApp.setGlobalPrefix("api");
		await httpApp.init();
		await httpApp.listen(0);
		url = await httpApp.getUrl();
	});
	afterAll(() => httpApp.close());

	it("rejects a regular user and allows the platform admin", async () => {
		const regular = await makeUser(app, "Regular2");
		const regularToken = await signAccessToken({ sub: regular.userId, org: regular.orgId });
		const denied = await fetch(`${url}/api/admin/payments`, { headers: { authorization: `Bearer ${regularToken}` } });
		expect(denied.status).toBe(403);

		const adminEmail = "boss@example.com"; // matches PLATFORM_ADMIN_EMAILS in vitest.config.ts
		const [existing] = await db(app).select().from(users).where(eq(users.email, adminEmail));
		let adminUserId: string;
		let adminOrgId: string;
		if (existing) {
			adminUserId = existing.id;
			const [m] = await db(app).select().from(memberships).where(eq(memberships.userId, existing.id)).limit(1);
			adminOrgId = m.organizationId;
		} else {
			const admin = await makeUser(app, "Boss2");
			await db(app).update(users).set({ email: adminEmail }).where(eq(users.id, admin.userId));
			adminUserId = admin.userId;
			adminOrgId = admin.orgId;
		}
		const adminToken = await signAccessToken({ sub: adminUserId, org: adminOrgId });
		const allowed = await fetch(`${url}/api/admin/payments`, { headers: { authorization: `Bearer ${adminToken}` } });
		expect(allowed.status).toBe(200);
	});
});
