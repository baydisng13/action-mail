import type { FolderRole, View } from "@postscript/types";
import { Archive, File, Inbox, type LucideIcon, Mails, Send, ShieldAlert, Star, Timer, Trash2 } from "lucide-react";

export const VIEW_META: Array<{ view: Exclude<View, "label">; label: string; icon: LucideIcon; role?: FolderRole }> = [
	{ view: "inbox", label: "Inbox", icon: Inbox, role: "inbox" },
	{ view: "starred", label: "Starred", icon: Star },
	{ view: "snoozed", label: "Snoozed", icon: Timer },
	{ view: "sent", label: "Sent", icon: Send, role: "sent" },
	{ view: "drafts", label: "Drafts", icon: File, role: "drafts" },
	{ view: "archive", label: "Archive", icon: Archive, role: "archive" },
	{ view: "spam", label: "Spam", icon: ShieldAlert, role: "spam" },
	{ view: "trash", label: "Trash", icon: Trash2, role: "trash" },
	{ view: "all", label: "All mail", icon: Mails, role: "all" },
];

export function viewLabel(view: View, labelName?: string): string {
	if (view === "label") return labelName ?? "Label";
	return VIEW_META.find((v) => v.view === view)?.label ?? "Inbox";
}
