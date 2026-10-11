import type { FolderView } from "@postscript/types";
import { FolderInput } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFolders } from "../hooks";

const ROLE_ORDER = ["inbox", "archive", "spam", "trash", "custom"];

/** Move the selection into a folder (IMAP) or label (Gmail) of its mailbox. */
export function MoveMenu({ mailboxId, onPick }: { mailboxId?: string; onPick: (f: FolderView) => void }) {
	const folders = useFolders(mailboxId);
	const list = (folders.data ?? [])
		.filter((f) => ROLE_ORDER.includes(f.role) && (!mailboxId || f.mailboxId === mailboxId))
		.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" aria-label="Move to" title="Move to" data-testid="move-menu" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
					<FolderInput className="h-4 w-4" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="dark max-h-80 w-56 overflow-y-auto text-foreground">
				<DropdownMenuLabel>Move to</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{list.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No folders yet</div>}
				{list.map((f) => (
					<DropdownMenuItem key={f.id} onSelect={() => onPick(f)}>
						<span className="truncate">{f.name}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
