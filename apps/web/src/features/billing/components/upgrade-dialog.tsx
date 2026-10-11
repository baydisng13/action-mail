import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { onUpgrade, type UpgradeEvent } from "@/lib/upgrade-bus";

const TITLES: Record<UpgradeEvent["code"], string> = {
	mailbox_limit: "You've reached your mailbox limit",
	ai_limit: "You've used this month's AI actions",
	seat_limit: "All seats are taken",
};

/** Mounted once in the app shell; opens for any 402 limit error. */
export function UpgradeDialogHost() {
	const [event, setEvent] = useState<UpgradeEvent | null>(null);
	useEffect(() => onUpgrade(setEvent), []);
	return (
		<Dialog open={Boolean(event)} onOpenChange={(v) => !v && setEvent(null)}>
			<DialogContent className="dark text-foreground sm:max-w-md" data-testid="upgrade-dialog">
				{event && (
					<>
						<DialogHeader>
							<div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
								<Sparkles className="h-5 w-5" />
							</div>
							<DialogTitle>{TITLES[event.code]}</DialogTitle>
							<DialogDescription>{event.message}</DialogDescription>
						</DialogHeader>
						<DialogFooter className="gap-2 sm:justify-start">
							<Button asChild onClick={() => setEvent(null)} data-testid="upgrade-cta">
								<Link to="/app/settings" search={{ tab: "billing" }}>
									See plans
								</Link>
							</Button>
							<Button variant="ghost" onClick={() => setEvent(null)}>
								Not now
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
