import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication, INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { eq } from "drizzle-orm";
import { PlatformSettingsService } from "../src/admin/platform-settings.service";
import { AppModule } from "../src/app.module";
import { signAccessToken } from "../src/common/jwt";
import { memberships, settingsAuditLog, users } from "../src/db/schema";
import { boot, db, makeUser, shutdown, uniq } from "./helpers";

let app: INestApplicationContext;
beforeAll(async () => {
	app = await boot();
});
afterAll(shutdown);

describe("platform settings precedence", () => {
	it("falls back to env, then prefers a saved ui value, then falls back again when cleared", async () => {
		const svc = app.get(PlatformSettingsService);
		const before = await svc.get();
		const model = before.items.find((i) => i.key === "AI_MODEL");
		expect(model?.source).toBe("env"); // AI_MODEL defaults to "deepseek-chat" via env schema
		expect(model?.value).toBe("deepseek-chat");

		await svc.update("owner@test.example", { AI_MODEL: "custom-model-x" });
		const after = await svc.get();
		const modelAfter = after.items.find((i) => i.key === "AI_MODEL");
		expect(modelAfter?.source).toBe("ui");
		expect(modelAfter?.value).toBe("custom-model-x");

		await svc.update("owner@test.example", { AI_MODEL: "" });
		const cleared = await svc.get();
		expect(cleared.items.find((i) => i.key === "AI_MODEL")?.source).toBe("env");
	});

	it("never returns the full value of a secret, only a mask", async () => {
		const svc = app.get(PlatformSettingsService);
		await svc.update("owner@test.example", { AI_API_KEY: "sk-abcdefghijkl1234" });
		const r = await svc.get();
		const item = r.items.find((i) => i.key === "AI_API_KEY");
		expect(item?.value).toBeNull();
		expect(item?.masked).not.toContain("abcdefghijkl");
		expect(item?.masked?.endsWith("1234")).toBe(true);
		await svc.update("owner@test.example", { AI_API_KEY: "" });
	});

	it("writes an audit entry per change, never the value", async () => {
		const svc = app.get(PlatformSettingsService);
		const actor = `audit-${uniq()}@test.example`;
		await svc.update(actor, { EMAIL_FROM: "Postscript <hi@example.com>" });
		const rows = await db(app).select().from(settingsAuditLog).where(eq(settingsAuditLog.actorEmail, actor));
		expect(rows.length).toBe(1);
		expect(rows[0].key).toBe("EMAIL_FROM");
		expect(rows[0].action).toBe("set");
		expect(JSON.stringify(rows)).not.toContain("hi@example.com");
		await svc.update(actor, { EMAIL_FROM: "" });
	});
});

describe("platform settings admin-only access (http)", () => {
	let httpApp: INestApplication;
	let url: string;
	const adminEmail = "boss@example.com"; // matches PLATFORM_ADMIN_EMAILS in vitest.config.ts

	beforeAll(async () => {
		httpApp = await NestFactory.create(AppModule, { logger: false });
		httpApp.setGlobalPrefix("api");
		await httpApp.init();
		await httpApp.listen(0);
		url = await httpApp.getUrl();
	});
	afterAll(() => httpApp.close());

	it("rejects a regular user and allows the platform admin", async () => {
		const regular = await makeUser(app, "Regular");
		const regularToken = await signAccessToken({ sub: regular.userId, org: regular.orgId });

		const denied = await fetch(`${url}/api/admin/settings`, { headers: { authorization: `Bearer ${regularToken}` } });
		expect(denied.status).toBe(403);

		const [existing] = await db(app).select().from(users).where(eq(users.email, adminEmail));
		let adminUserId: string;
		let adminOrgId: string;
		if (existing) {
			adminUserId = existing.id;
			const [m] = await db(app).select().from(memberships).where(eq(memberships.userId, existing.id)).limit(1);
			adminOrgId = m.organizationId;
		} else {
			const admin = await makeUser(app, "Boss");
			await db(app).update(users).set({ email: adminEmail }).where(eq(users.id, admin.userId));
			adminUserId = admin.userId;
			adminOrgId = admin.orgId;
		}
		const adminToken = await signAccessToken({ sub: adminUserId, org: adminOrgId });

		const allowed = await fetch(`${url}/api/admin/settings`, { headers: { authorization: `Bearer ${adminToken}` } });
		expect(allowed.status).toBe(200);
		const body = (await allowed.json()) as { items: unknown[] };
		expect(Array.isArray(body.items)).toBe(true);
	});
});
