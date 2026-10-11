import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplicationContext } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import type { Redis } from "ioredis";
import nodemailer from "nodemailer";
import { orgCipher } from "../src/common/crypto";
import { messages } from "../src/db/schema";
import { ActionsService } from "../src/mail/actions.service";
import { ComposeService } from "../src/mail/compose.service";
import { MailboxService, scopeOf } from "../src/mail/mailbox.service";
import { ReadService } from "../src/mail/read.service";
import { SearchService } from "../src/mail/search.service";
import { SyncService } from "../src/mail/sync.service";
import { QueueService } from "../src/queue/queue.service";
import { QUEUES } from "../src/queue/queues";
import { REDIS } from "../src/redis/redis.module";
import { boot, db, GREENMAIL, greenmailMailbox, makeUser, shutdown, uniq } from "./helpers";

let app: INestApplicationContext;
beforeAll(async () => {
	process.env.IMAP_ALLOW_PRIVATE_HOSTS = "true";
	app = await boot();
});
afterAll(shutdown);

async function smtpSend(opts: nodemailer.SendMailOptions) {
	const t = nodemailer.createTransport({ host: GREENMAIL, port: 3025, secure: false, ignoreTLS: true });
	await t.sendMail(opts);
	t.close();
}

async function syncAll(mailboxId: string) {
	const sync = app.get(SyncService);
	for (let i = 0; i < 30; i++) {
		const r = await sync.backfillStep(mailboxId);
		if (!r.hasMore) return;
	}
}

/** Every text-ish value in every table and every Redis value, as one string. */
async function dumpEverything(): Promise<string> {
	const tables = (await db(app).execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`)).map((r) => r.tablename);
	let out = "";
	for (const t of tables) {
		const rows = await db(app).execute(sql.raw(`select * from "${t}"`));
		out += JSON.stringify(rows);
	}
	const redis = app.get<Redis>(REDIS);
	const keys = await redis.keys("*");
	for (const k of keys) {
		const type = await redis.type(k);
		if (type === "string") out += (await redis.getBuffer(k))?.toString("latin1") ?? "";
		else if (type === "hash") out += JSON.stringify(await redis.hgetall(k));
	}
	return out;
}

async function takeActionJobs(mailboxId: string) {
	const q = app.get(QueueService).queue(QUEUES.mailAction);
	const jobs = await q.getJobs(["waiting", "delayed", "prioritized"]);
	const mine = jobs.filter((j) => j.data.mailboxId === mailboxId);
	for (const j of mine) await j.remove();
	return mine.map((j) => j.data);
}

async function serverFolders(email: string): Promise<Record<string, string[]>> {
	const c = new ImapFlow({ host: GREENMAIL, port: 3143, secure: false, auth: { user: email, pass: "secret" }, logger: false });
	await c.connect();
	const out: Record<string, string[]> = {};
	for (const f of await c.list()) {
		const lock = await c.getMailboxLock(f.path);
		try {
			out[f.path] = [];
			if ((c.mailbox as { exists?: number }).exists) {
				for await (const m of c.fetch("1:*", { envelope: true })) out[f.path].push(m.envelope?.subject ?? "");
			}
		} finally {
			lock.release();
		}
	}
	await c.logout();
	return out;
}

describe("IMAP mailbox end to end (GreenMail)", () => {
	it("syncs metadata only, reads bodies live, organizes and sends both ways", async () => {
		const id = uniq();
		const me = `me-${id}@ps.test`;
		const friend = `friend-${id}@ps.test`;
		const SUBJECT = `PLAINSUBJ${id}`;
		const BODY = `PLAINBODY${id}`;
		const user = await makeUser(app, "Mail Tester");
		const box = await greenmailMailbox(app, user, me);
		const scope = scopeOf(user);

		await smtpSend({
			from: `Friend <${friend}>`,
			to: me,
			subject: SUBJECT,
			text: `Hello, ${BODY}. Please reply.`,
			html: `<p>Hello, <b>${BODY}</b>.</p><img src="https://tracker.example/p.gif">`,
			messageId: `<root-${id}@ps.test>`,
			attachments: [{ filename: "notes.txt", content: `ATTACH${id}` }],
		});
		await syncAll(box.id);

		// 1. The inbox lists it (subject decrypted on read)...
		const read = app.get(ReadService);
		const list = await read.listThreads(scope, { view: "inbox" });
		const item = list.threads.find((t) => t.subject === SUBJECT);
		expect(item).toBeTruthy();
		expect(item?.hasAttachments).toBe(true);
		expect(item?.unread).toBe(true);

		// 2. ...but no plaintext subject, body or attachment is stored anywhere.
		let dump = await dumpEverything();
		expect(dump).not.toContain(SUBJECT);
		expect(dump).not.toContain(BODY);
		expect(dump).not.toContain(`ATTACH${id}`);
		expect(dump).not.toContain(friend);

		// 3. Opening fetches the body live; remote images are blocked; attachment listed.
		const detail = await read.getThread(scope, item!.id, { images: false });
		expect(detail.messages[0].html).toContain(BODY);
		expect(detail.messages[0].hasRemoteImages).toBe(true);
		expect(detail.messages[0].html).not.toMatch(/\ssrc="https:\/\/tracker/);
		expect(detail.messages[0].attachments.map((a) => a.filename)).toContain("notes.txt");
		const att = await read.attachmentContent(detail.messages[0].id, detail.messages[0].attachments[0].id);
		expect(att.content.toString()).toBe(`ATTACH${id}`);
		// the 1-hour cache is encrypted
		dump = await dumpEverything();
		expect(dump).not.toContain(BODY);

		// 4. Provider search finds it (no local content index).
		const found = await app.get(SearchService).search(scope, { q: BODY });
		expect(found.threads.map((t) => t.id)).toContain(item!.id);

		// 5. Reply: prefilled, threaded, sent through SMTP and saved to Sent.
		const compose = app.get(ComposeService);
		const draft = await compose.create(user, { mode: "reply", sourceMessageId: detail.messages[0].id });
		expect(draft.to).toEqual([friend]);
		expect(draft.subject).toBe(`Re: ${SUBJECT}`);
		const content = { mailboxId: box.id, to: draft.to, cc: [], bcc: [], subject: draft.subject, html: `<p>Got it ${id}</p>${draft.html}`, uploadIds: [], forwardAttachmentIds: [] };
		await compose.save(user, draft.id, content);
		const sent = await compose.send(user, draft.id, content);
		expect(sent.undoSeconds).toBeGreaterThan(0);
		// undo works inside the window...
		const undone = await compose.undo(user, sent.outboxId);
		expect(undone.draftId).toBe(draft.id);
		// ...then send for real (the worker would run this after the delay)
		const sent2 = await compose.send(user, draft.id, content);
		await compose.deliver(sent2.outboxId, true);
		let folders = await serverFolders(me);
		expect(folders.Sent).toContain(`Re: ${SUBJECT}`);
		const friendBox = await serverFolders(friend);
		expect(friendBox.INBOX).toContain(`Re: ${SUBJECT}`);
		const after = await read.getThread(scope, item!.id, { images: false });
		expect(after.messages.length).toBe(2); // the sent reply joined the thread

		// 6. Archive: local first, then the provider move (worker job).
		const actions = app.get(ActionsService);
		await actions.apply(scope, { threadIds: [item!.id], action: "archive" });
		expect((await read.listThreads(scope, { view: "inbox" })).threads.find((t) => t.id === item!.id)).toBeFalsy();
		expect((await read.listThreads(scope, { view: "archive" })).threads.find((t) => t.id === item!.id)).toBeTruthy();
		for (const job of await takeActionJobs(box.id)) await actions.execute(job);
		folders = await serverFolders(me);
		expect(folders.Archive).toContain(SUBJECT);
		expect(folders.INBOX ?? []).not.toContain(SUBJECT);

		// 7. Changes made elsewhere sync back: star it on the server.
		const c = new ImapFlow({ host: GREENMAIL, port: 3143, secure: false, auth: { user: me, pass: "secret" }, logger: false });
		await c.connect();
		const lock = await c.getMailboxLock("Archive");
		await c.messageFlagsAdd("1:*", ["\\Flagged"]);
		lock.release();
		await c.logout();
		await app.get(SyncService).incremental(box.id);
		expect((await read.listThreads(scope, { view: "starred" })).threads.find((t) => t.id === item!.id)).toBeTruthy();

		// 8. Still nothing in plaintext, then disconnect deletes everything.
		dump = await dumpEverything();
		expect(dump).not.toContain(SUBJECT);
		expect(dump).not.toContain(BODY);
		expect(dump).not.toContain(`Got it ${id}`);
		await app.get(MailboxService).disconnect(scope, box.id);
		expect(await db(app).select().from(messages).where(eq(messages.mailboxId, box.id))).toHaveLength(0);
		const redis = app.get<Redis>(REDIS);
		expect(await redis.keys(`c:${user.orgId}:${box.id}:*`)).toHaveLength(0);
		expect(orgCipher(user.orgId)).toBeTruthy();
	}, 120_000);
});
