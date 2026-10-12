import { type AdminOrgRow, PLAN_IDS, PLANS, type PlanId } from "@postscript/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { adminApi } from "@/features/admin/api";
import { useMe } from "@/features/auth/hooks";
import { getApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/admin")({
	component: AdminPage,
});

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function AdminPage() {
	const me = useMe();
	const [tab, setTab] = useState<"orgs" | "users">("orgs");
	const [q, setQ] = useState("");
	if (me.data && !me.data.user.isPlatformAdmin) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
				<p className="font-medium">This page is for Postscript staff.</p>
				<Link to="/app" className="text-sm underline">Back to mail</Link>
			</div>
		);
	}
	return (
		<div className="h-full overflow-y-auto" data-testid="admin-console">
			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
				<div className="flex items-center justify-between gap-2">
					<h1 className="font-display text-3xl tracking-tight">Admin</h1>
					<Link
						to="/app/admin/settings"
						data-testid="nav-platform-settings"
						className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/[0.07] hover:text-foreground"
					>
						Platform settings
					</Link>
				</div>
				<Overview />
				<div className="mt-8 flex flex-wrap items-center gap-2">
					{(["orgs", "users"] as const).map((t) => (
						<button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 text-sm", tab === t ? "bg-white/[0.07]" : "text-muted-foreground hover:text-foreground")}>
							{t === "orgs" ? "Workspaces" : "Users"}
						</button>
					))}
					<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="ml-auto h-9 w-64" data-testid="admin-search" />
				</div>
				{tab === "orgs" ? <OrgsTable q={q} /> : <UsersTable q={q} />}
			</div>
		</div>
	);
}

function Overview() {
	const o = useQuery({ queryKey: ["admin", "overview"], queryFn: adminApi.overview });
	if (o.isLoading) return <Spinner className="mt-6 h-5 w-5" />;
	if (!o.data) return <p className="mt-6 text-sm text-muted-foreground">{getApiError(o.error).message}</p>;
	const stats: Array<[string, string]> = [
		["MRR (estimate)", money(o.data.mrrCents)],
		["Paying workspaces", String(o.data.paidOrgs)],
		["Workspaces", String(o.data.orgs)],
		["Users", String(o.data.users)],
		["Mailboxes", String(o.data.mailboxes)],
		["AI actions this month", o.data.aiActionsThisMonth.toLocaleString("en-US")],
	];
	return (
		<dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6" data-testid="admin-overview">
			{stats.map(([k, v]) => (
				<div key={k}>
					<dt className="text-xs text-muted-foreground">{k}</dt>
					<dd className="mt-1 text-2xl font-medium tabular-nums">{v}</dd>
				</div>
			))}
		</dl>
	);
}

function OrgsTable({ q }: { q: string }) {
	const qc = useQueryClient();
	const orgs = useQuery({ queryKey: ["admin", "orgs", q], queryFn: () => adminApi.orgs(q) });
	const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
	const grant = useMutation({
		mutationFn: (v: { id: string; plan: PlanId | null; seats?: number }) => adminApi.grant(v.id, v.plan, v.seats),
		onSuccess: () => {
			toast.success("Plan updated");
			refresh();
		},
		onError: (err) => toast.error(getApiError(err).message),
	});
	const suspend = useMutation({
		mutationFn: (v: { id: string; suspended: boolean }) => adminApi.suspend(v.id, v.suspended),
		onSuccess: refresh,
		onError: (err) => toast.error(getApiError(err).message),
	});
	if (orgs.isLoading) return <Spinner className="mt-6 h-5 w-5" />;
	if (!orgs.data) return <p className="mt-6 text-sm text-muted-foreground">{getApiError(orgs.error).message}</p>;
	return (
		<div className="mt-4 overflow-x-auto">
			<table className="w-full min-w-[900px] text-sm" data-testid="admin-orgs">
				<thead className="text-left text-xs text-muted-foreground">
					<tr>
						<th className="py-2 pr-3 font-normal">Workspace</th>
						<th className="py-2 pr-3 font-normal">Plan</th>
						<th className="py-2 pr-3 font-normal">Members</th>
						<th className="py-2 pr-3 font-normal">Mailboxes</th>
						<th className="py-2 pr-3 font-normal">AI (month)</th>
						<th className="py-2 pr-3 font-normal">Subscription</th>
						<th className="py-2 pr-3 font-normal">MRR</th>
						<th className="py-2 pr-3 font-normal">Grant plan</th>
						<th className="py-2 font-normal" />
					</tr>
				</thead>
				<tbody className="divide-y divide-white/[0.05]">
					{orgs.data.map((o) => <OrgRow key={o.id} o={o} onGrant={(plan, seats) => grant.mutate({ id: o.id, plan, seats })} onSuspend={(s) => suspend.mutate({ id: o.id, suspended: s })} />)}
					{orgs.data.length === 0 && (
						<tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No workspaces found</td></tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

function OrgRow({ o, onGrant, onSuspend }: { o: AdminOrgRow; onGrant: (plan: PlanId | null, seats?: number) => void; onSuspend: (s: boolean) => void }) {
	const [seats, setSeats] = useState(2);
	return (
		<tr className={cn(o.suspended && "opacity-60")} data-testid="admin-org-row">
			<td className="py-2.5 pr-3">
				<div className="font-medium">{o.name}</div>
				<div className="text-xs text-muted-foreground">{o.isPersonal ? "Personal" : "Team"} · {new Date(o.createdAt).toLocaleDateString()}</div>
			</td>
			<td className="py-2.5 pr-3">
				{PLANS[o.plan].name}
				{o.compPlan && <span className="ml-1 text-xs text-primary">comp</span>}
			</td>
			<td className="py-2.5 pr-3 tabular-nums">{o.members}</td>
			<td className="py-2.5 pr-3 tabular-nums">{o.mailboxes}</td>
			<td className="py-2.5 pr-3 tabular-nums">{o.aiActionsThisMonth}</td>
			<td className="py-2.5 pr-3 text-muted-foreground">{o.subscriptionStatus ?? "none"}</td>
			<td className="py-2.5 pr-3 tabular-nums">{money(o.mrrCents)}</td>
			<td className="py-2.5 pr-3">
				<div className="flex items-center gap-1.5">
					<select
						aria-label="Grant plan"
						value={o.compPlan ?? ""}
						onChange={(e) => onGrant((e.target.value || null) as PlanId | null, e.target.value === "team" ? seats : undefined)}
						className="rounded-md bg-white/[0.05] px-2 py-1 text-xs outline-none"
					>
						<option value="" className="bg-neutral-900">No grant</option>
						{PLAN_IDS.map((p) => (
							<option key={p} value={p} className="bg-neutral-900">{PLANS[p].name}</option>
						))}
					</select>
					<input type="number" min={1} value={seats} onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))} title="Seats for a Team grant" className="w-14 rounded-md bg-white/[0.05] px-2 py-1 text-xs outline-none" />
				</div>
			</td>
			<td className="py-2.5 text-right">
				<button type="button" onClick={() => onSuspend(!o.suspended)} className={cn("rounded-md px-2 py-1 text-xs", o.suspended ? "bg-white/[0.06]" : "text-destructive hover:bg-destructive/10")}>
					{o.suspended ? "Unsuspend" : "Suspend"}
				</button>
			</td>
		</tr>
	);
}

function UsersTable({ q }: { q: string }) {
	const users = useQuery({ queryKey: ["admin", "users", q], queryFn: () => adminApi.users(q) });
	if (users.isLoading) return <Spinner className="mt-6 h-5 w-5" />;
	if (!users.data) return <p className="mt-6 text-sm text-muted-foreground">{getApiError(users.error).message}</p>;
	return (
		<div className="mt-4 overflow-x-auto">
			<table className="w-full min-w-[600px] text-sm" data-testid="admin-users">
				<thead className="text-left text-xs text-muted-foreground">
					<tr>
						<th className="py-2 pr-3 font-normal">Name</th>
						<th className="py-2 pr-3 font-normal">Email</th>
						<th className="py-2 pr-3 font-normal">Verified</th>
						<th className="py-2 pr-3 font-normal">Workspaces</th>
						<th className="py-2 font-normal">Joined</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-white/[0.05]">
					{users.data.map((u) => (
						<tr key={u.id}>
							<td className="py-2.5 pr-3">{u.fullName}</td>
							<td className="py-2.5 pr-3 text-muted-foreground">{u.email}</td>
							<td className="py-2.5 pr-3">{u.verified ? "Yes" : "No"}</td>
							<td className="py-2.5 pr-3 tabular-nums">{u.organizations}</td>
							<td className="py-2.5">{new Date(u.createdAt).toLocaleDateString()}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
