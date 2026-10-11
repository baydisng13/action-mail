import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isEntitled, monthlyCents, resolvePlan, type SubLike } from "../src/billing/plan-resolver";
import { PolarWebhookUnknownTypeError, PolarWebhookVerificationError, verifyPolarWebhook } from "../src/billing/polar";

const sub = (p: Partial<SubLike>): SubLike => ({
	plan: "pro",
	status: "active",
	seats: 1,
	currentPeriodEnd: new Date(Date.now() + 86400_000),
	endedAt: null,
	amountCents: 900,
	interval: "month",
	...p,
});

describe("plan resolution", () => {
	it("free without subscriptions", () => {
		expect(resolvePlan({ compPlan: null, compSeats: null }, [])).toEqual({ plan: "free", seats: 1, source: "free" });
	});
	it("active subscription gives its plan; team seats carry over", () => {
		expect(resolvePlan({ compPlan: null, compSeats: null }, [sub({ plan: "team", seats: 6 })])).toEqual({ plan: "team", seats: 6, source: "subscription" });
	});
	it("canceled keeps access until the period ends, revoked does not", () => {
		expect(isEntitled(sub({ status: "canceled" }))).toBe(true);
		expect(isEntitled(sub({ status: "canceled", currentPeriodEnd: new Date(Date.now() - 1000) }))).toBe(false);
		expect(isEntitled(sub({ status: "canceled", endedAt: new Date(Date.now() - 1000) }))).toBe(false);
		expect(isEntitled(sub({ status: "incomplete" }))).toBe(false);
	});
	it("a manual grant (comp) wins over everything", () => {
		expect(resolvePlan({ compPlan: "team", compSeats: 3 }, [sub({ status: "canceled", endedAt: new Date() })])).toEqual({ plan: "team", seats: 3, source: "comp" });
	});
	it("MRR normalizes yearly and ignores trials", () => {
		expect(monthlyCents(sub({ amountCents: 9000, interval: "year" }))).toBe(750);
		expect(monthlyCents(sub({ status: "trialing" }))).toBe(0);
	});
});

function sign(secret: string, id: string, ts: number, body: string) {
	return `v1,${createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

describe("Polar webhook signature", () => {
	const secret = "whsec_test_secret_value";
	const body = JSON.stringify({ type: "subscription.updated", data: { id: "sub_1", status: "active", product_id: "p" } });

	it("accepts a correctly signed event", async () => {
		const ts = Math.floor(Date.now() / 1000);
		const ev = await verifyPolarWebhook(Buffer.from(body), { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": sign(secret, "msg_1", ts, body) }, secret);
		expect((ev as { type: string }).type).toBe("subscription.updated");
	});

	it("rejects a tampered body, wrong secret, missing headers and old timestamps", async () => {
		const ts = Math.floor(Date.now() / 1000);
		const good = sign(secret, "msg_1", ts, body);
		const call = (b: string, h: Record<string, string>, s = secret) => verifyPolarWebhook(Buffer.from(b), h, s);
		await expect(call(body.replace("active", "canceled"), { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": good })).rejects.toBeInstanceOf(PolarWebhookVerificationError);
		await expect(call(body, { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": good }, "whsec_other")).rejects.toBeInstanceOf(PolarWebhookVerificationError);
		await expect(call(body, {}, secret)).rejects.toBeInstanceOf(PolarWebhookVerificationError);
		const old = ts - 3600;
		await expect(call(body, { "webhook-id": "msg_1", "webhook-timestamp": String(old), "webhook-signature": sign(secret, "msg_1", old, body) })).rejects.toBeInstanceOf(PolarWebhookVerificationError);
	});

	it("reports unknown event types separately", async () => {
		const ts = Math.floor(Date.now() / 1000);
		const b = JSON.stringify({ type: "something.new", data: {} });
		await expect(verifyPolarWebhook(Buffer.from(b), { "webhook-id": "m", "webhook-timestamp": String(ts), "webhook-signature": sign(secret, "m", ts, b) }, secret)).rejects.toBeInstanceOf(PolarWebhookUnknownTypeError);
	});
});
