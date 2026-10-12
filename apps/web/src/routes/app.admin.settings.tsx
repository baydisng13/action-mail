import { SETTING_GROUPS, type SettingGroupId, type SettingItem } from "@postscript/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { platformSettingsApi } from "@/features/admin/settings-api";
import { useMe } from "@/features/auth/hooks";
import { getApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/admin/settings")({
	component: PlatformSettingsPage,
});

function PlatformSettingsPage() {
	const me = useMe();
	const isAdmin = Boolean(me.data?.user.isPlatformAdmin);
	const q = useQuery({ queryKey: ["admin", "settings"], queryFn: platformSettingsApi.get, enabled: isAdmin });

	if (me.data && !isAdmin) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
				<p className="font-medium">This page is for Postscript staff.</p>
				<Link to="/app" className="text-sm underline">Back to mail</Link>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto" data-testid="platform-settings">
			<div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Link to="/app/admin" className="hover:text-foreground">Admin</Link>
					<span>/</span>
					<span>Platform settings</span>
				</div>
				<h1 className="mt-1 font-display text-3xl tracking-tight">Platform settings</h1>
				<p className="mt-2 max-w-xl text-sm text-muted-foreground">
					Set up the outside services Postscript uses. A value saved here overrides the server's environment
					variable right away, with no restart needed. Leave a field empty and save to go back to the
					environment variable.
				</p>
				{q.isLoading && <Spinner className="mt-8 h-5 w-5" />}
				{q.error && <p className="mt-8 text-sm text-destructive">{getApiError(q.error).message}</p>}
				{q.data && <Groups data={q.data} />}
			</div>
		</div>
	);
}

function Groups({ data }: { data: Awaited<ReturnType<typeof platformSettingsApi.get>> }) {
	const byKey = new Map(data.items.map((i) => [i.key, i]));
	return (
		<div className="mt-8 flex flex-col gap-10">
			{SETTING_GROUPS.map((g) => (
				<GroupCard
					key={g.id}
					group={g}
					items={g.fields.map((f) => byKey.get(f.key)).filter((i): i is SettingItem => Boolean(i))}
					googleRedirectUris={g.id === "google" ? data.googleRedirectUris : undefined}
					polarWebhookUrl={g.id === "payments" ? data.polarWebhookUrl : undefined}
				/>
			))}
		</div>
	);
}

function statusOf(group: (typeof SETTING_GROUPS)[number], items: SettingItem[]): "configured" | "not configured" {
	const byKey = new Map(items.map((i) => [i.key, i]));
	const ok = group.requiredKeys.every((k) => byKey.get(k)?.source !== "unset");
	return ok ? "configured" : "not configured";
}

function GroupCard({
	group,
	items,
	googleRedirectUris,
	polarWebhookUrl,
}: {
	group: (typeof SETTING_GROUPS)[number];
	items: SettingItem[];
	googleRedirectUris?: string[];
	polarWebhookUrl?: string;
}) {
	const qc = useQueryClient();
	const byKey = new Map(items.map((i) => [i.key, i]));
	const [edits, setEdits] = useState<Record<string, string>>({});
	const [testAddress, setTestAddress] = useState("");
	const [testInput, setTestInput] = useState("");
	const status = statusOf(group, items);

	const save = useMutation({
		mutationFn: (updates: Record<string, string>) => platformSettingsApi.update(updates),
		onSuccess: (data) => {
			qc.setQueryData(["admin", "settings"], data);
			setEdits({});
			toast.success(`${group.label} settings saved`);
		},
		onError: (err) => toast.error(getApiError(err).message),
	});

	const test = useMutation({
		mutationFn: () => platformSettingsApi.test(group.id as SettingGroupId, testAddress || undefined, testInput || undefined),
		onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
		onError: (err) => toast.error(getApiError(err).message),
	});

	const hasEdits = Object.keys(edits).length > 0;

	return (
		<section data-testid={`settings-group-${group.id}`} className="rounded-xl border border-white/[0.06] p-5">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h2 className="text-lg font-medium">{group.label}</h2>
					<p className="mt-1 max-w-md text-sm text-muted-foreground">{group.help}</p>
				</div>
				<span
					data-testid={`settings-status-${group.id}`}
					className={cn(
						"shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
						status === "configured" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.06] text-muted-foreground",
					)}
				>
					{status}
				</span>
			</div>
			<a href={group.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary underline">
				{group.linkLabel}
			</a>

			{group.id === "google" && <RedirectUris uris={googleRedirectUris} />}
			{group.id === "payments" && polarWebhookUrl && (
				<div className="mt-3 rounded-lg bg-white/[0.04] p-3 text-xs">
					<p className="text-muted-foreground">Paste this into the Polar webhook URL:</p>
					<p className="mt-1 font-mono">{polarWebhookUrl}</p>
				</div>
			)}

			<div className="mt-4 flex flex-col gap-3">
				{group.fields.map((f) => {
					const item = byKey.get(f.key);
					const current = edits[f.key];
					if (f.kind === "toggle") {
						const on = current != null ? current === "true" : item?.value === "true";
						return (
							<div key={f.key} className="flex items-center justify-between gap-2">
								<span className="text-sm">{f.label}</span>
								<button
									type="button"
									role="switch"
									aria-checked={on}
									data-testid={`setting-toggle-${f.key}`}
									onClick={() => setEdits((prev) => ({ ...prev, [f.key]: on ? "false" : "true" }))}
									className={cn("h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-white/[0.12]")}
								>
									<span className={cn("block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform", on && "translate-x-[22px]")} />
								</button>
							</div>
						);
					}
					return (
						<div key={f.key} className="flex flex-col gap-1">
							<label htmlFor={f.key} className="text-xs text-muted-foreground">
								{f.label}
							</label>
							<div className="flex items-center gap-2">
								{f.kind === "textarea" ? (
									<textarea
										id={f.key}
										data-testid={`setting-input-${f.key}`}
										placeholder={item?.value ?? f.placeholder}
										value={current ?? ""}
										onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))}
										className="h-20 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
									/>
								) : (
									<Input
										id={f.key}
										data-testid={`setting-input-${f.key}`}
										type={f.secret ? "password" : "text"}
										placeholder={f.secret ? (item?.masked ? `Saved: ${item.masked}` : f.placeholder) : (item?.value ?? f.placeholder)}
										value={current ?? ""}
										onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))}
										className="h-9"
									/>
								)}
								{item?.source === "ui" && <span className="shrink-0 text-xs text-muted-foreground">from admin</span>}
								{item?.source === "env" && <span className="shrink-0 text-xs text-muted-foreground">from env</span>}
							</div>
						</div>
					);
				})}
			</div>

			{group.id === "email" && (
				<Input
					data-testid="settings-test-email-address"
					placeholder="you@example.com (optional, to send a real test email)"
					value={testAddress}
					onChange={(e) => setTestAddress(e.target.value)}
					className="mt-3 h-9"
				/>
			)}
			{group.id === "telebirr" && (
				<Input
					data-testid="settings-test-telebirr-txn"
					placeholder="A known Telebirr receipt transaction id, to test the relay and parser"
					value={testInput}
					onChange={(e) => setTestInput(e.target.value)}
					className="mt-3 h-9"
				/>
			)}

			<div className="mt-4 flex items-center gap-2">
				<button
					type="button"
					data-testid={`settings-save-${group.id}`}
					disabled={!hasEdits || save.isPending}
					onClick={() => save.mutate(edits)}
					className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
				>
					{save.isPending ? "Saving..." : "Save"}
				</button>
				{group.id !== "currency" && group.id !== "methods" && (
					<button
						type="button"
						data-testid={`settings-test-${group.id}`}
						disabled={test.isPending}
						onClick={() => test.mutate()}
						className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm hover:bg-white/[0.1] disabled:opacity-40"
					>
						{test.isPending ? "Testing..." : "Test"}
					</button>
				)}
			</div>
			{test.data?.fields && (
				<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white/[0.03] p-3 text-xs">
					{Object.entries(test.data.fields).map(([k, v]) => (
						<div key={k} className="contents">
							<dt className="text-muted-foreground">{k}</dt>
							<dd>{v == null ? "-" : String(v)}</dd>
						</div>
					))}
				</dl>
			)}
		</section>
	);
}

function RedirectUris({ uris }: { uris?: string[] }) {
	if (!uris?.length) return null;
	return (
		<div className="mt-3 rounded-lg bg-white/[0.04] p-3 text-xs">
			<p className="text-muted-foreground">Paste these into the Google OAuth client as authorized redirect URIs:</p>
			<ul className="mt-1 flex flex-col gap-0.5 font-mono">
				{uris.map((u) => (
					<li key={u}>{u}</li>
				))}
			</ul>
		</div>
	);
}
