import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const SHORTCUTS: Array<[string, string]> = [
	["c", "Compose"],
	["/", "Search"],
	["j / k", "Next / previous conversation"],
	["Enter or o", "Open conversation"],
	["u", "Back to list"],
	["e", "Archive"],
	["#", "Delete"],
	["s", "Star or unstar"],
	["r", "Reply"],
	["a", "Reply all"],
	["f", "Forward"],
	["Shift + i", "Mark as read"],
	["Shift + u", "Mark as unread"],
	["x", "Select conversation"],
	["Esc", "Close or clear selection"],
	["?", "Show shortcuts"],
];

function typing(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Global key handler. Ignored while typing or when a modifier (Ctrl/Cmd/Alt) is held. */
export function useShortcuts(handler: (key: string, e: KeyboardEvent) => void, enabled = true) {
	useEffect(() => {
		if (!enabled) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
			if (document.querySelector('[data-testid="compose-window"]') && e.key !== "?") return;
			if (document.querySelector('[role="dialog"], [role="menu"]')) return;
			const key = e.shiftKey && /^[a-z]$/i.test(e.key) ? `shift+${e.key.toLowerCase()}` : e.key;
			handler(key, e);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [handler, enabled]);
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="dark text-foreground sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
				</DialogHeader>
				<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
					{SHORTCUTS.map(([k, label]) => (
						<div key={k} className="contents">
							<dt>
								<kbd className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
							</dt>
							<dd className="text-muted-foreground">{label}</dd>
						</div>
					))}
				</dl>
			</DialogContent>
		</Dialog>
	);
}
