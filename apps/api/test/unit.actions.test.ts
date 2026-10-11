import { describe, expect, it } from "vitest";
import { applyLocal } from "../src/mail/local-actions";

const byRole = { inbox: "INBOX", archive: "Archive", trash: "Trash", spam: "Junk", sent: "Sent", drafts: "Drafts" };
const gm = (labels: string[]) => ({ labels, roles: [], isUnread: false, isStarred: false });
const im = (path: string, role: string) => ({ labels: [path], roles: [role], isUnread: true, isStarred: false });

describe("local organize actions", () => {
	it("gmail archive removes INBOX and becomes archive", () => {
		const r = applyLocal("gmail", gm(["INBOX", "UNREAD", "Label_1"]), "archive", { byRole, latest: true });
		expect(r && r !== "delete" && r.labels).toEqual(["UNREAD", "Label_1"]);
		expect(r && r !== "delete" && r.roles).toEqual(["archive"]);
	});

	it("gmail trash and restore", () => {
		const t = applyLocal("gmail", gm(["INBOX"]), "trash", { byRole, latest: true });
		expect(t && t !== "delete" && t.roles).toEqual(["trash"]);
		const r = applyLocal("gmail", gm(["TRASH"]), "restore", { byRole, latest: true });
		expect(r && r !== "delete" && r.roles).toEqual(["inbox"]);
	});

	it("gmail move to a custom label leaves the inbox", () => {
		const r = applyLocal("gmail", gm(["INBOX"]), "move", { byRole, latest: true, folder: { providerId: "Label_9", role: "custom" } });
		expect(r && r !== "delete" && r.labels).toEqual(["Label_9"]);
	});

	it("imap archive moves only inbox messages, never Sent copies", () => {
		const a = applyLocal("imap", im("INBOX", "inbox"), "archive", { byRole, latest: true });
		expect(a && a !== "delete" && a.labels).toEqual(["Archive"]);
		expect(applyLocal("imap", im("Sent", "sent"), "archive", { byRole, latest: true })).toBeNull();
	});

	it("imap delete from trash is permanent, elsewhere it moves to trash", () => {
		expect(applyLocal("imap", im("Trash", "trash"), "delete", { byRole, latest: true })).toBe("delete");
		const r = applyLocal("imap", im("INBOX", "inbox"), "delete", { byRole, latest: true });
		expect(r && r !== "delete" && r.labels).toEqual(["Trash"]);
	});

	it("star applies to the newest message only; read applies to all", () => {
		expect(applyLocal("imap", im("INBOX", "inbox"), "star", { byRole, latest: false })).toBeNull();
		const s = applyLocal("imap", im("INBOX", "inbox"), "star", { byRole, latest: true });
		expect(s && s !== "delete" && s.isStarred).toBe(true);
		const r = applyLocal("imap", im("INBOX", "inbox"), "read", { byRole, latest: false });
		expect(r && r !== "delete" && r.isUnread).toBe(false);
	});
});
