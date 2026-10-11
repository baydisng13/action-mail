import type { MeResponse } from "@postscript/types";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getApiError } from "@/lib/api-client";
import { useCreateOrg, useSwitchOrg } from "../hooks";

const PLAN_LABEL = { free: "Free", pro: "Pro", team: "Team" } as const;

export function WorkspaceSwitcher({ me }: { me: MeResponse }) {
	const navigate = useNavigate();
	const switchOrg = useSwitchOrg();
	const [creating, setCreating] = useState(false);
	const active = me.activeOrg;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						data-testid="workspace-switcher"
						className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/[0.04]"
					>
						<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-semibold text-primary">
							{active.name.slice(0, 1).toUpperCase()}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm font-medium" data-testid="workspace-name">{active.name}</span>
							<span className="block text-xs text-muted-foreground">
								{active.isPersonal ? "Personal" : "Team"} · {PLAN_LABEL[active.plan]}
							</span>
						</span>
						<ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="dark w-64 text-foreground">
					<DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
					{me.organizations.map((o) => (
						<DropdownMenuItem
							key={o.id}
							data-testid="workspace-item"
							onSelect={() => {
								if (o.id === active.id) return;
								switchOrg.mutate(o.id, {
									onSuccess: () => navigate({ to: "/app" }),
									onError: (err) => toast.error(getApiError(err).message),
								});
							}}
							className="gap-2"
						>
							{o.isPersonal ? <span className="h-4 w-4 text-center text-xs">P</span> : <Users className="h-4 w-4" />}
							<span className="min-w-0 flex-1 truncate">{o.name}</span>
							{o.id === active.id && <Check className="h-4 w-4 text-primary" />}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem data-testid="create-org-open" onSelect={() => setCreating(true)} className="gap-2">
						<Plus className="h-4 w-4" />
						Create team workspace
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<CreateOrgDialog open={creating} onOpenChange={setCreating} />
		</>
	);
}

export function CreateOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const navigate = useNavigate();
	const create = useCreateOrg();
	const [name, setName] = useState("");
	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				onOpenChange(v);
				if (!v) {
					setName("");
					create.reset();
				}
			}}
		>
			<DialogContent className="dark text-foreground sm:max-w-md">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate(name.trim(), {
							onSuccess: () => {
								onOpenChange(false);
								setName("");
								toast.success("Team workspace created");
								navigate({ to: "/app/settings", search: { tab: "workspace" } });
							},
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>Create a team workspace</DialogTitle>
						<DialogDescription>
							A shared space with its own members and billing. Each person still only sees their own mailboxes.
						</DialogDescription>
					</DialogHeader>
					<div className="my-5">
						<Input
							autoFocus
							data-testid="create-org-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Acme Inc"
							maxLength={80}
						/>
						{create.error && <p className="mt-2 text-sm text-destructive">{getApiError(create.error).message}</p>}
					</div>
					<DialogFooter>
						<Button type="submit" data-testid="create-org-submit" disabled={name.trim().length < 2 || create.isPending}>
							{create.isPending && <Spinner />}
							Create workspace
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
