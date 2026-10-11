import { Inject, Injectable } from "@nestjs/common";
import type { ThreadActionInput } from "@postscript/types";
import { and, eq, inArray } from "drizzle-orm";
import { ApiError } from "../common/errors";
import { log } from "../common/logger";
import { DB, type Db } from "../db/db";
import { type Mailbox, type MailboxFolder, mailboxes, mailboxFolders, messages, threads } from "../db/schema";
import { QueueService } from "../queue/queue.service";
import type { MailActionJob } from "../queue/queues";
import * as gmail from "./gmail.client";
import { folderStatus, withImap } from "./imap.client";
import { IngestService } from "./ingest.service";
import { applyLocal } from "./local-actions";
import { type MailScope, MailboxService } from "./mailbox.service";

@Injectable()
export class ActionsService {
	constructor(
		@Inject(DB) private readonly db: Db,
		private readonly boxes: MailboxService,
		private readonly queues: QueueService,
		private readonly ingest: IngestService,
	) {}

	/**
	 * Apply an organize action: update local state at once (so the UI is fast),
	 * then queue the provider change. The next sync reconciles either way.
	 */
	async apply(scope: MailScope, input: ThreadActionInput): Promise<{ updated: number }> {
		const rows = await this.db
			.select({ t: threads, mb: mailboxes })
			.from(threads)
			.innerJoin(mailboxes, eq(mailboxes.id, threads.mailboxId))
			.where(
				and(
					inArray(threads.id, input.threadIds),
					eq(threads.organizationId, scope.orgId),
					eq(mailboxes.organizationId, scope.orgId),
					eq(mailboxes.userId, scope.userId),
				),
			);
		if (!rows.length) throw new ApiError(404, "Conversation not found", "thread_not_found");

		if (input.action === "snooze" || input.action === "unsnooze") {
			if (input.action === "snooze" && (!input.until || new Date(input.until) <= new Date())) {
				throw new ApiError(400, "Pick a time in the future", "invalid_input");
			}
			await this.db
				.update(threads)
				.set({ snoozedUntil: input.action === "snooze" ? new Date(input.until as string) : null })
				.where(inArray(threads.id, rows.map((r) => r.t.id)));
			return { updated: rows.length };
		}

		const byMailbox = new Map<string, { mb: Mailbox; threadIds: string[]; providerThreadIds: string[] }>();
		for (const r of rows) {
			const g = byMailbox.get(r.mb.id) ?? { mb: r.mb, threadIds: [], providerThreadIds: [] };
			g.threadIds.push(r.t.id);
			g.providerThreadIds.push(r.t.providerThreadId);
			byMailbox.set(r.mb.id, g);
		}

		let updated = 0;
		for (const { mb, threadIds, providerThreadIds } of byMailbox.values()) {
			const folders = await this.db.select().from(mailboxFolders).where(eq(mailboxFolders.mailboxId, mb.id));
			let folder: MailboxFolder | undefined;
			if (input.action === "move" || input.action === "addLabel" || input.action === "removeLabel") {
				folder = folders.find((f) => f.id === input.folderId);
				if (!folder) throw new ApiError(400, "Choose a folder from the same mailbox", "folder_not_found");
			}
			if (mb.provider === "gmail" && input.action === "delete") {
				throw new ApiError(400, "Gmail deletes mail in Trash for you after 30 days.", "gmail_no_delete");
			}
			const byRole: Record<string, string> = {};
			for (const f of folders) if (f.role !== "custom" && !byRole[f.role]) byRole[f.role] = f.providerId;

			const msgs = await this.db
				.select()
				.from(messages)
				.where(and(inArray(messages.threadId, threadIds), eq(messages.organizationId, scope.orgId)));
			const latestByThread = new Map<string, string>();
			for (const m of [...msgs].sort((a, b) => (b.internalDate?.getTime() ?? 0) - (a.internalDate?.getTime() ?? 0))) {
				if (m.threadId && !latestByThread.has(m.threadId)) latestByThread.set(m.threadId, m.id);
			}

			const job: MailActionJob = {
				mailboxId: mb.id,
				action: input.action,
				target: folder ? { providerId: folder.providerId, role: folder.role } : null,
				providerThreadIds,
				items: [],
			};
			const toDelete: string[] = [];
			for (const m of msgs) {
				const res = applyLocal(
					mb.provider,
					{ labels: m.labels ?? [], roles: m.roles ?? [], isUnread: m.isUnread, isStarred: m.isStarred },
					input.action,
					{ folder: folder ? { providerId: folder.providerId, role: folder.role } : undefined, byRole, latest: latestByThread.get(m.threadId ?? "") === m.id },
				);
				if (!res) continue;
				job.items.push({
					messageId: m.id,
					providerMessageId: m.providerMessageId,
					folder: m.folder,
					uid: m.uid,
					toFolder: res === "delete" ? null : mb.provider === "imap" ? res.labels[0] : null,
					toRole: res === "delete" ? null : (res.roles[0] ?? null),
					flags: res === "delete" ? null : { unread: res.isUnread, starred: res.isStarred },
					remove: res === "delete",
				});
				if (res === "delete") toDelete.push(m.id);
				else {
					await this.db
						.update(messages)
						.set({ labels: res.labels, roles: res.roles, isUnread: res.isUnread, isStarred: res.isStarred })
						.where(eq(messages.id, m.id));
				}
				updated++;
			}
			if (toDelete.length) {
				await this.db.delete(messages).where(inArray(messages.id, toDelete));
				await this.ingest.pruneEmptyThreads(mb.id);
			}
			if (job.items.length) await this.queues.safe("mail-action", () => this.queues.mailAction(job));
		}
		return { updated };
	}

	// ─── Provider side (runs in the worker) ─────────────────────────────────
	async execute(job: MailActionJob): Promise<void> {
		const mb = await this.boxes.byId(job.mailboxId);
		if (!mb) return;
		if (mb.provider === "gmail") await this.executeGmail(mb, job);
		else await this.executeImap(mb, job);
	}

	private async executeGmail(mb: Mailbox, job: MailActionJob) {
		const token = await this.boxes.gmailToken(mb);
		const ids = job.items.map((i) => i.providerMessageId);
		const t = job.target;
		switch (job.action) {
			case "read":
				await gmail.modifyMessages(token, ids, [], ["UNREAD"]);
				return;
			case "unread":
				await gmail.modifyMessages(token, ids, ["UNREAD"], []);
				return;
			case "star":
				await gmail.modifyMessages(token, ids, ["STARRED"], []);
				return;
			case "unstar":
				await gmail.modifyMessages(token, ids, [], ["STARRED"]);
				return;
		}
		for (const tid of job.providerThreadIds) {
			switch (job.action) {
				case "archive":
					await gmail.modifyThread(token, tid, [], ["INBOX"]);
					break;
				case "trash":
					await gmail.trashThread(token, tid);
					break;
				case "restore":
					await gmail.untrashThread(token, tid);
					await gmail.modifyThread(token, tid, ["INBOX"], []);
					break;
				case "inbox":
				case "notSpam":
					await gmail.untrashThread(token, tid).catch(() => undefined);
					await gmail.modifyThread(token, tid, ["INBOX"], ["SPAM"]);
					break;
				case "spam":
					await gmail.modifyThread(token, tid, ["SPAM"], ["INBOX"]);
					break;
				case "move":
					if (!t) break;
					if (t.role === "archive") await gmail.modifyThread(token, tid, [], ["INBOX", "SPAM"]);
					else if (t.role === "trash") await gmail.trashThread(token, tid);
					else if (t.role === "inbox") await gmail.modifyThread(token, tid, ["INBOX"], ["SPAM"]);
					else if (t.role === "spam") await gmail.modifyThread(token, tid, ["SPAM"], ["INBOX"]);
					else await gmail.modifyThread(token, tid, [t.providerId], ["INBOX"]);
					break;
				case "addLabel":
					if (t) await gmail.modifyThread(token, tid, [t.providerId], []);
					break;
				case "removeLabel":
					if (t) await gmail.modifyThread(token, tid, [], [t.providerId]);
					break;
			}
		}
	}

	private async executeImap(mb: Mailbox, job: MailActionJob) {
		await withImap(this.boxes.imapConfig(mb), async (c) => {
			const groups = new Map<string, MailActionJob["items"]>();
			for (const it of job.items) {
				if (!it.folder || !it.uid) continue;
				groups.set(it.folder, [...(groups.get(it.folder) ?? []), it]);
			}
			for (const [folder, items] of groups) {
				const lock = await c.getMailboxLock(folder);
				try {
					// Flags
					const flagOps: Array<[boolean, string, (i: (typeof items)[number]) => boolean | undefined]> = [
						[true, "\\Seen", (i) => i.flags?.unread === false],
						[false, "\\Seen", (i) => i.flags?.unread === true],
						[true, "\\Flagged", (i) => i.flags?.starred === true],
						[false, "\\Flagged", (i) => i.flags?.starred === false],
					];
					if (["read", "unread", "star", "unstar"].includes(job.action)) {
						for (const [add, flag, pick] of flagOps) {
							const uids = items.filter(pick).map((i) => i.uid as number);
							if (!uids.length) continue;
							if (add) await c.messageFlagsAdd(uids.join(","), [flag], { uid: true });
							else await c.messageFlagsRemove(uids.join(","), [flag], { uid: true });
						}
						continue;
					}
					// Permanent delete (from Trash)
					const del = items.filter((i) => i.remove).map((i) => i.uid as number);
					if (del.length) await c.messageDelete(del.join(","), { uid: true });
					// Moves, grouped by destination
					const byDest = new Map<string, typeof items>();
					for (const i of items) {
						if (i.remove || !i.toFolder || i.toFolder === folder) continue;
						byDest.set(i.toFolder, [...(byDest.get(i.toFolder) ?? []), i]);
					}
					for (const [dest, moving] of byDest) {
						const res = await c.messageMove(moving.map((i) => i.uid).join(","), dest, { uid: true });
						const map = res && typeof res === "object" ? (res as { uidMap?: Map<number, number> }).uidMap : undefined;
						let destValidity: string | null = null;
						if (map?.size) destValidity = (await folderStatus(c, dest)).uidValidity;
						for (const i of moving) {
							const newUid = map?.get(i.uid as number);
							if (newUid && destValidity) {
								await this.db
									.update(messages)
									.set({ folder: dest, uid: newUid, providerMessageId: `${dest}|${destValidity}|${newUid}` })
									.where(eq(messages.id, i.messageId));
							} else {
								// No UIDPLUS: drop the stale row; the next sync of `dest` re-adds it.
								await this.db.delete(messages).where(eq(messages.id, i.messageId));
							}
						}
					}
				} finally {
					lock.release();
				}
			}
		});
		await this.ingest.pruneEmptyThreads(mb.id);
		log.info("mail.action.done", { mailboxId: mb.id, action: job.action, n: job.items.length });
	}
}
