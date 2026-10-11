import type { InviteView, MeResponse, Role } from "@postscript/types";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Trash2, UserMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Section } from "@/features/settings/section";
import { getApiError } from "@/lib/api-client";
import { orgsApi } from "../api";
import { useMembers, useOrgMutation, useSwitchOrg } from "../hooks";
import { CreateOrgDialog } from "./workspace-switcher";

export function WorkspaceTab({ me }: { me: MeResponse }) {
	const org = me.activeOrg;
	const canManage = org.role === "owner" || org.role === "admin";
	const [creating, setCreating] = useState(false);
	return (
		<div className="divide-y divide-white/[0.06]">
			<Section title="Workspace" description={org.isPersonal ? "Your personal workspace. Only you can see it." : "A shared workspace. Members only see their own mailboxes."}>
				{canManage && !org.isPersonal ? <RenameForm name={org.name} /> : <p className="text-sm" data-testid="workspace-current">{org.name}</p>}
				{org.isPersonal && (
					<div className="mt-4">
						<Button variant="outline" onClick={() => setCreating(true)} data-testid="create-org-from-settings">
							Create a team workspace
						</Button>
						<CreateOrgDialog open={creating} onOpenChange={setCreating} />
					</div>
				)}
			</Section>
			{!org.isPersonal && <MembersSection me={me} canManage={canManage} />}
			{!org.isPersonal && <DangerSection me={me} />}
		</div>
	);
}

function RenameForm({ name }: { name: string }) {
	const [value, setValue] = useState(name);
	const rename = useOrgMutation((n: string) => orgsApi.rename(n));
	return (
		<form
			className="flex max-w-sm gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				rename.mutate(value.trim(), { onSuccess: () => toast.success("Workspace renamed"), onError: (err) => toast.error(getApiError(err).message) });
			}}
		>
			<Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} />
			<Button type="submit" variant="outline" disabled={rename.isPending || value.trim().length < 2 || value.trim() === name}>
				Save
			</Button>
		</form>
	);
}

function MembersSection({ me, canManage }: { me: MeResponse; canManage: boolean }) {
	const members = useMembers();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [lastLink, setLastLink] = useState<string | null>(null);
	const invite = useOrgMutation((v: { email: string; role: "member" | "admin" }) => orgsApi.invite(v));
	const revoke = useOrgMutation((id: string) => orgsApi.revokeInvite(id));
	const setMemberRole = useOrgMutation((v: { userId: string; role: Exclude<Role, "owner"> }) => orgsApi.setRole(v.userId, v.role));
	const remove = useOrgMutation((userId: string) => orgsApi.removeMember(userId));
	const seatsLabel = `${me.usage.seatsUsed} of ${me.usage.seatsLimit} seats used`;

	const copy = (link: string) => {
		navigator.clipboard?.writeText(link).then(
			() => toast.success("Invite link copied"),
			() => toast("Copy the link from the list"),
		);
	};

	return (
		<Section title="Members" description={seatsLabel} testId="members-section">
			{members.isLoading ? (
				<Spinner className="h-5 w-5" />
			) : members.isError ? (
				<p className="text-sm text-muted-foreground">{getApiError(members.error).message}</p>
			) : (
				<div className="space-y-6">
					<ul className="divide-y divide-white/[0.05]" data-testid="members-list">
						{members.data?.members.map((m) => (
							<li key={m.userId} className="flex items-center gap-3 py-2.5">
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm">
										{m.fullName}
										{m.userId === me.user.id && <span className="ml-1 text-muted-foreground">(you)</span>}
									</div>
									<div className="truncate text-xs text-muted-foreground">{m.email}</div>
								</div>
								{m.role === "owner" || !canManage || m.userId === me.user.id ? (
									<span className="text-xs text-muted-foreground capitalize">{m.role}</span>
								) : (
									<>
										<select
											aria-label="Role"
											value={m.role}
											onChange={(e) => setMemberRole.mutate({ userId: m.userId, role: e.target.value as "admin" | "member" }, { onError: (err) => toast.error(getApiError(err).message) })}
											className="rounded-md bg-white/[0.05] px-2 py-1 text-xs outline-none"
										>
											<option value="member" className="bg-neutral-900">Member</option>
											<option value="admin" className="bg-neutral-900">Admin</option>
										</select>
										<button
											type="button"
											aria-label={`Remove ${m.fullName}`}
											onClick={() => {
												if (window.confirm(`Remove ${m.fullName} from this workspace? Their mailboxes here are disconnected.`)) {
													remove.mutate(m.userId, { onError: (err) => toast.error(getApiError(err).message) });
												}
											}}
											className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
										>
											<UserMinus className="h-4 w-4" />
										</button>
									</>
								)}
							</li>
						))}
					</ul>

					{(members.data?.invites.length ?? 0) > 0 && (
						<div>
							<p className="mb-1 text-xs font-medium text-muted-foreground">Pending invites</p>
							<ul className="divide-y divide-white/[0.05]" data-testid="invites-list">
								{members.data?.invites.map((i: InviteView) => (
									<li key={i.id} className="flex items-center gap-3 py-2.5" data-testid="invite-row">
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm">{i.email}</div>
											<div className="text-xs text-muted-foreground capitalize">
												{i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
											</div>
										</div>
										{i.link && (
											<button type="button" aria-label="Copy invite link" onClick={() => copy(i.link as string)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground">
												<Copy className="h-4 w-4" />
											</button>
										)}
										{canManage && (
											<button
												type="button"
												aria-label={`Revoke invite for ${i.email}`}
												onClick={() => revoke.mutate(i.id)}
												className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
											>
												<Trash2 className="h-4 w-4" />
											</button>
										)}
									</li>
								))}
							</ul>
						</div>
					)}

					{canManage && (
						<form
							className="space-y-2"
							onSubmit={(e) => {
								e.preventDefault();
								invite.mutate(
									{ email: email.trim(), role },
									{
										onSuccess: (inv) => {
											setEmail("");
											const link = (inv as InviteView).link ?? null;
											setLastLink(link);
											toast.success(link ? "Invite created. Email is not set up, so share the link." : "Invite sent");
										},
										onError: (err) => {
											if (getApiError(err).status !== 402) toast.error(getApiError(err).message);
										},
									},
								);
							}}
						>
							<p className="text-xs font-medium text-muted-foreground">Invite someone</p>
							<div className="flex flex-wrap gap-2">
								<Input
									type="email"
									required
									data-testid="invite-email"
									placeholder="name@company.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="min-w-[12rem] flex-1"
								/>
								<select
									aria-label="Role"
									data-testid="invite-role"
									value={role}
									onChange={(e) => setRole(e.target.value as "member" | "admin")}
									className="rounded-md bg-white/[0.05] px-2 text-sm outline-none"
								>
									<option value="member" className="bg-neutral-900">Member</option>
									<option value="admin" className="bg-neutral-900">Admin</option>
								</select>
								<Button type="submit" data-testid="invite-submit" disabled={invite.isPending || !email.trim()}>
									{invite.isPending && <Spinner />}
									Send invite
								</Button>
							</div>
							{lastLink && (
								<div className="flex items-center gap-2 rounded-lg bg-white/[0.04] p-2.5" data-testid="invite-link">
									<code className="min-w-0 flex-1 truncate text-xs">{lastLink}</code>
									<Button type="button" size="sm" variant="ghost" onClick={() => copy(lastLink)}>
										<Copy className="h-3.5 w-3.5" />
										Copy
									</Button>
								</div>
							)}
						</form>
					)}
				</div>
			)}
		</Section>
	);
}

function DangerSection({ me }: { me: MeResponse }) {
	const navigate = useNavigate();
	const switchOrg = useSwitchOrg();
	const personal = me.organizations.find((o) => o.isPersonal);
	const isOwner = me.activeOrg.role === "owner";
	const [busy, setBusy] = useState(false);

	const after = async () => {
		if (personal) await switchOrg.mutateAsync(personal.id).catch(() => undefined);
		navigate({ to: "/app" });
	};

	return (
		<Section title={isOwner ? "Delete workspace" : "Leave workspace"} description={isOwner ? "Removes the workspace, its members' mailboxes in it and all its data. Cancel any paid plan first." : "You lose access to this workspace. Your mailboxes in it are disconnected."}>
			<Button
				variant="destructive"
				disabled={busy}
				data-testid={isOwner ? "delete-workspace" : "leave-workspace"}
				onClick={async () => {
					if (!window.confirm(isOwner ? `Delete ${me.activeOrg.name}? This cannot be undone.` : `Leave ${me.activeOrg.name}?`)) return;
					setBusy(true);
					try {
						if (isOwner) await orgsApi.remove();
						else await orgsApi.removeMember(me.user.id);
						await after();
					} catch (err) {
						toast.error(getApiError(err).message);
						setBusy(false);
					}
				}}
			>
				{busy && <Spinner />}
				{isOwner ? "Delete workspace" : "Leave workspace"}
			</Button>
		</Section>
	);
}
