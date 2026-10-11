import { Mail } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useMailboxes } from "../hooks";

const ALL = "__all__";

/**
 * Mailbox indicator + switcher. With a single mailbox it shows the connected
 * address (context, no dropdown). With more than one it becomes a filter -
 * value `null` = all mailboxes.
 */
export function MailboxSwitcher({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (mailboxId: string | null) => void;
}) {
	const mailboxes = useMailboxes();
	const list = mailboxes.data ?? [];
	if (list.length === 0) return null;

	if (list.length === 1) {
		return (
			<span className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground">
				<Mail className="h-3.5 w-3.5 text-primary" />
				<span className="max-w-[180px] truncate">{list[0].emailAddress}</span>
			</span>
		);
	}

	return (
		<Select
			value={value ?? ALL}
			onValueChange={(v) => onChange(v === ALL ? null : v)}
		>
			<SelectTrigger size="sm" className="h-8 w-auto gap-1.5 text-xs">
				<Mail className="h-3.5 w-3.5 text-primary" />
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>All mailboxes</SelectItem>
				{list.map((m) => (
					<SelectItem key={m.id} value={m.id}>
						{m.emailAddress}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
