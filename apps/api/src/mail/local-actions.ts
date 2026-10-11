import type { ThreadAction } from "@postscript/types";
import { gmailRoles } from "./gmail.client";

export interface LocalMsg {
	labels: string[];
	roles: string[];
	isUnread: boolean;
	isStarred: boolean;
}

export interface FolderRef {
	providerId: string;
	role: string;
}

export interface ActionTarget {
	/** Target folder for move/addLabel/removeLabel. */
	folder?: FolderRef;
	/** Folder paths/ids by role, for the mailbox (IMAP paths or Gmail ids). */
	byRole: Partial<Record<string, string>>;
	/** Is this the newest message of the thread? (star/unread apply to it only) */
	latest: boolean;
}

export type LocalResult = LocalMsg | "delete" | null;

const sysForRole: Record<string, string> = { inbox: "INBOX", spam: "SPAM", trash: "TRASH" };

/**
 * How one message changes locally for an action, before the provider confirms.
 * Pure: unit-tested, and mirrored by the provider executor. null = unchanged.
 */
export function applyLocal(provider: "gmail" | "imap", msg: LocalMsg, action: ThreadAction, t: ActionTarget): LocalResult {
	const has = (r: string) => msg.roles.includes(r);
	const next: LocalMsg = { ...msg, labels: [...msg.labels], roles: [...msg.roles] };

	if (action === "read") return msg.isUnread ? { ...next, isUnread: false } : null;
	if (action === "unread") return t.latest && !msg.isUnread ? { ...next, isUnread: true } : null;
	if (action === "star") return t.latest && !msg.isStarred ? { ...next, isStarred: true } : null;
	if (action === "unstar") return msg.isStarred ? { ...next, isStarred: false } : null;
	if (action === "snooze" || action === "unsnooze") return null;

	if (provider === "gmail") {
		const add: string[] = [];
		const remove: string[] = [];
		switch (action) {
			case "archive":
				remove.push("INBOX");
				break;
			case "inbox":
			case "notSpam":
			case "restore":
				add.push("INBOX");
				remove.push("SPAM", "TRASH");
				break;
			case "trash":
			case "delete":
				add.push("TRASH");
				remove.push("INBOX");
				break;
			case "spam":
				add.push("SPAM");
				remove.push("INBOX");
				break;
			case "move": {
				const f = t.folder;
				if (!f) return null;
				if (f.role === "archive") remove.push("INBOX", "SPAM", "TRASH");
				else if (sysForRole[f.role]) {
					add.push(sysForRole[f.role]);
					remove.push(...["INBOX", "SPAM", "TRASH"].filter((x) => x !== sysForRole[f.role]));
				} else {
					add.push(f.providerId);
					remove.push("INBOX");
				}
				break;
			}
			case "addLabel":
				if (t.folder) add.push(t.folder.providerId);
				break;
			case "removeLabel":
				if (t.folder) remove.push(t.folder.providerId);
				break;
		}
		const labels = [...new Set([...next.labels.filter((l) => !remove.includes(l)), ...add])];
		if (labels.join() === msg.labels.join()) return null;
		return { ...next, labels, roles: gmailRoles(labels) };
	}

	// IMAP: a message lives in exactly one folder.
	const moveTo = (role: string, path?: string): LocalResult => {
		const p = path ?? t.byRole[role];
		if (!p || msg.labels[0] === p) return null;
		return { ...next, labels: [p], roles: [role] };
	};
	switch (action) {
		case "archive":
			return has("inbox") ? moveTo("archive") : null;
		case "inbox":
			return has("archive") || has("spam") || has("trash") || has("custom") ? moveTo("inbox") : null;
		case "trash":
			return has("trash") ? null : moveTo("trash");
		case "restore":
			return has("trash") ? moveTo("inbox") : null;
		case "delete":
			return has("trash") ? "delete" : moveTo("trash");
		case "spam":
			return has("inbox") || has("archive") || has("custom") ? moveTo("spam") : null;
		case "notSpam":
			return has("spam") ? moveTo("inbox") : null;
		case "move":
		case "addLabel":
			if (!t.folder || has("sent") || has("drafts")) return null;
			return moveTo(t.folder.role, t.folder.providerId);
		case "removeLabel":
			return t.folder && msg.labels[0] === t.folder.providerId ? moveTo("inbox") : null;
	}
	return null;
}
