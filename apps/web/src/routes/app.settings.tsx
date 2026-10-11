import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/features/auth/hooks";
import { BillingTab } from "@/features/billing/components/billing-tab";
import { MailboxesTab } from "@/features/mailbox/components/mailboxes-tab";
import { WorkspaceTab } from "@/features/orgs/components/workspace-tab";
import { AccountTab } from "@/features/settings/account-tab";
import { cn } from "@/lib/utils";

const TABS = [
	["account", "Account"],
	["workspace", "Workspace"],
	["billing", "Plan and billing"],
	["mailboxes", "Mailboxes"],
] as const;
type Tab = (typeof TABS)[number][0];

export const Route = createFileRoute("/app/settings")({
	validateSearch: z.object({ tab: z.enum(["account", "workspace", "billing", "mailboxes"]).optional().catch(undefined) }),
	component: SettingsPage,
});

function SettingsPage() {
	const { tab = "account" } = Route.useSearch();
	const navigate = useNavigate({ from: "/app/settings" });
	const me = useMe();
	if (!me.data) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner className="h-6 w-6" />
			</div>
		);
	}
	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
				<h1 className="font-display text-3xl tracking-tight">Settings</h1>
				<div className="mt-5 mb-4 flex gap-1 overflow-x-auto" role="tablist">
					{TABS.map(([key, label]) => (
						<button
							key={key}
							type="button"
							role="tab"
							aria-selected={tab === key}
							data-testid={`tab-${key}`}
							onClick={() => navigate({ search: { tab: key as Tab } })}
							className={cn(
								"shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors",
								tab === key ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground",
							)}
						>
							{label}
						</button>
					))}
				</div>
				{tab === "account" && <AccountTab me={me.data} />}
				{tab === "workspace" && <WorkspaceTab me={me.data} />}
				{tab === "billing" && <BillingTab me={me.data} />}
				{tab === "mailboxes" && <MailboxesTab />}
			</div>
		</div>
	);
}
