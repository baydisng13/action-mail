import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplicationContext } from "@nestjs/common";
import { LimitsService } from "../src/billing/limits.service";
import { orgCipher } from "../src/common/crypto";
import { messages, threads } from "../src/db/schema";
import { ActionsService } from "../src/mail/actions.service";
import { MailboxService, scopeOf } from "../src/mail/mailbox.service";
import { ReadService } from "../src/mail/read.service";
import { OrgsService } from "../src/orgs/orgs.service";
import { TodosService } from "../src/todos/todos.service";
import { asMemberOf, boot, db, greenmailMailbox, makeUser, refreshOrg, shutdown } from "./helpers";

let app: INestApplicationContext;
beforeAll(async () => {
	app = await boot();
});
afterAll(shutdown);

async function seedThread(c: Awaited<ReturnType<typeof makeUser>>, mailboxId: string) {
	const cipher = orgCipher(c.orgId);
	const [t] = await db(app)
		.insert(threads)
		.values({ organizationId: c.orgId, mailboxId, providerThreadId: `t-${Math.random()}`, lastMessageAt: new Date(), messageCount: 1 })
		.returning();
	await db(app).insert(messages).values({
		organizationId: c.orgId,
		mailboxId,
		threadId: t.id,
		providerMessageId: `INBOX|1|${Math.floor(Math.random() * 1e9)}`,
		folder: "INBOX",
		uid: 1,
		envelopeEnc: cipher.enc({ from: { name: "A", address: "a@x" }, to: [], cc: [], bcc: [], replyTo: null, subject: "Hello", snippet: "hi", messageId: null }),
		labels: ["INBOX"],
		roles: ["inbox"],
		isUnread: true,
		internalDate: new Date(),
	});
	return t;
}

describe("tenant isolation", () => {
	it("another workspace can't list, open, change or delete your mail", async () => {
		const alice = await makeUser(app, "Alice");
		const mallory = await makeUser(app, "Mallory");
		const box = await greenmailMailbox(app, alice, `alice-${Date.now()}@x.test`);
		const t = await seedThread(alice, box.id);
		const read = app.get(ReadService);
		const boxes = app.get(MailboxService);
		const actions = app.get(ActionsService);

		expect((await read.listThreads(scopeOf(alice), { view: "inbox" })).threads.map((x) => x.id)).toContain(t.id);
		expect((await read.listThreads(scopeOf(mallory), { view: "inbox" })).threads).toHaveLength(0);
		await expect(read.requireThread(scopeOf(mallory), t.id)).rejects.toMatchObject({ status: 404 });
		await expect(boxes.require(scopeOf(mallory), box.id)).rejects.toMatchObject({ status: 404 });
		await expect(actions.apply(scopeOf(mallory), { threadIds: [t.id], action: "trash" })).rejects.toMatchObject({ status: 404 });
		await expect(boxes.disconnect(scopeOf(mallory), box.id)).rejects.toMatchObject({ status: 404 });
		expect(await boxes.folders(scopeOf(mallory), undefined)).toEqual([]);
	});

	it("a teammate in the same workspace still can't see your private mailbox", async () => {
		const owner = await makeUser(app, "Owner");
		const team = await app.get(OrgsService).create(owner, "Acme");
		const ownerInTeam = await asMemberOf(app, owner, team.id, "owner");
		const mate = await asMemberOf(app, await makeUser(app, "Mate"), team.id, "member");
		const box = await greenmailMailbox(app, ownerInTeam, `own-${Date.now()}@x.test`);
		const t = await seedThread(ownerInTeam, box.id);
		const read = app.get(ReadService);
		expect((await read.listThreads(scopeOf(mate), { view: "inbox" })).threads).toHaveLength(0);
		await expect(read.requireThread(scopeOf(mate), t.id)).rejects.toMatchObject({ status: 404 });
		// and the owner's personal workspace doesn't show team mail
		expect((await read.listThreads(scopeOf(owner), { view: "inbox" })).threads.map((x) => x.id)).not.toContain(t.id);
	});

	it("to-dos are private per person and workspace, and stored encrypted", async () => {
		const a = await makeUser(app);
		const b = await makeUser(app);
		const todos = app.get(TodosService);
		const t = await todos.create(scopeOf(a), { title: "Pay the rent" });
		expect((await todos.list(scopeOf(a))).map((x) => x.title)).toEqual(["Pay the rent"]);
		expect(await todos.list(scopeOf(b))).toEqual([]);
		await expect(todos.update(scopeOf(b), t.id, { status: "done" })).rejects.toMatchObject({ status: 404 });
		await expect(todos.remove(scopeOf(b), t.id)).rejects.toMatchObject({ status: 404 });
		const raw = await db(app).execute(`select content_enc from todos where id = '${t.id}'`);
		expect(JSON.stringify(raw)).not.toContain("rent");
	});
});

describe("plan limits (enforced in the api)", () => {
	it("free plan: one mailbox, then mailbox_limit", async () => {
		const u = await makeUser(app);
		const limits = app.get(LimitsService);
		await limits.assertCanAddMailbox(u.org, u.userId);
		await greenmailMailbox(app, u, `one-${Date.now()}@x.test`);
		await expect(limits.assertCanAddMailbox(u.org, u.userId)).rejects.toMatchObject({ status: 402, code: "mailbox_limit" });
	});

	it("AI usage is metered atomically per org per month", async () => {
		const u = await makeUser(app);
		const limits = app.get(LimitsService);
		const results = await Promise.allSettled(Array.from({ length: 60 }, () => limits.meterAi(u.org)));
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(50);
		expect(await limits.aiUsed(u.orgId)).toBe(50);
		await expect(limits.meterAi(u.org)).rejects.toMatchObject({ code: "ai_limit" });
	});

	it("seats: personal workspaces can't invite; free team has 2 seats", async () => {
		const u = await makeUser(app);
		const orgs = app.get(OrgsService);
		await expect(orgs.invite(u, "x@example.test", "member")).rejects.toMatchObject({ code: "personal_workspace" });
		const team = await orgs.create(u, "Team");
		const inTeam = await refreshOrg(app, await asMemberOf(app, u, team.id, "owner"));
		const inv = await orgs.invite(inTeam, "first@example.test", "member");
		expect(inv.link).toContain("/invite/");
		await expect(orgs.invite(inTeam, "second@example.test", "member")).rejects.toMatchObject({ status: 402, code: "seat_limit" });
	});
});
