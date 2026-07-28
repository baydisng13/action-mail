import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock, Mail, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { AuthError } from "@/features/auth/components/auth-error";
import { useChangePassword, useMe } from "@/features/auth/hooks";
import { ImapConnectDialog } from "@/features/mailbox/components/imap-connect-dialog";
import { useDisconnect, useMailboxes, useStartConnect } from "@/features/mailbox/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/settings")({
	component: SettingsPage,
});

type Tab = "overview" | "security" | "email";
const TABS: { key: Tab; label: string }[] = [
	{ key: "overview", label: "Overview" },
	{ key: "security", label: "Security" },
	{ key: "email", label: "Email integrations" },
];

function SettingsPage() {
	const [tab, setTab] = useState<Tab>("overview");
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
			<div className="mx-auto max-w-3xl px-6 py-10">
				<h1 className="font-display text-3xl tracking-tight">Settings</h1>
				<div className="mb-8 mt-4 flex items-center gap-1 border-b border-white/5">
					{TABS.map((t) => (
						<button
							key={t.key}
							type="button"
							onClick={() => setTab(t.key)}
							className={cn(
								"-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
								tab === t.key
									? "border-primary text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							{t.label}
						</button>
					))}
				</div>

				{tab === "overview" && <Overview me={me.data} />}
				{tab === "security" && (
					<SecurityTab hasPassword={me.data.user.hasPassword} />
				)}
				{tab === "email" && <EmailTab plan={me.data.activeTeam.plan} />}
			</div>
		</div>
	);
}

function Overview({ me }: { me: NonNullable<ReturnType<typeof useMe>["data"]> }) {
	const { user, activeTeam, memberships, entitlements } = me;
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Account
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1.5">
						<p className="font-medium">{user.fullName}</p>
						<p className="text-sm text-muted-foreground">{user.email}</p>
						<Badge variant={user.emailVerified ? "default" : "secondary"}>
							{user.emailVerified ? "Verified" : "Unverified"}
						</Badge>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Team &amp; plan
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1.5">
						<p className="font-medium">{activeTeam.name}</p>
						<div className="flex gap-2">
							<Badge variant="outline">{activeTeam.role}</Badge>
							<Badge variant="outline">{activeTeam.plan}</Badge>
						</div>
						<p className="text-xs text-muted-foreground">
							{memberships.length} team{memberships.length === 1 ? "" : "s"}
						</p>
					</CardContent>
				</Card>
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Entitlements
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					{entitlements.map((f) => (
						<Badge key={f} variant="secondary" className="font-mono text-xs">
							{f}
						</Badge>
					))}
				</CardContent>
			</Card>
		</div>
	);
}

function SecurityTab({ hasPassword }: { hasPassword: boolean }) {
	const change = useChangePassword();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [localError, setLocalError] = useState<string | null>(null);

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		setLocalError(null);
		if (next.length < 8) return setLocalError("Use at least 8 characters.");
		if (next !== confirm) return setLocalError("Passwords don't match.");
		change.mutate(
			{ currentPassword: hasPassword ? current : undefined, newPassword: next },
			{
				onSuccess: () => {
					toast.success(hasPassword ? "Password updated" : "Password set");
					setCurrent("");
					setNext("");
					setConfirm("");
				},
			},
		);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<Lock className="h-4 w-4" />
					{hasPassword ? "Change password" : "Set a password"}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{!hasPassword && (
					<p className="mb-4 text-sm text-muted-foreground">
						You signed up with Google. Set a password to also sign in with your
						email.
					</p>
				)}
				<form onSubmit={submit} className="max-w-sm">
					<FieldGroup>
						{change.error && <AuthError error={change.error} />}
						{localError && (
							<p className="text-sm text-destructive">{localError}</p>
						)}
						{hasPassword && (
							<Field>
								<FieldLabel htmlFor="current">Current password</FieldLabel>
								<PasswordInput
									id="current"
									autoComplete="current-password"
									value={current}
									onChange={(e) => setCurrent(e.target.value)}
								/>
							</Field>
						)}
						<Field>
							<FieldLabel htmlFor="new">New password</FieldLabel>
							<PasswordInput
								id="new"
								autoComplete="new-password"
								placeholder="At least 8 characters"
								value={next}
								onChange={(e) => setNext(e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
							<PasswordInput
								id="confirm"
								autoComplete="new-password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
							/>
						</Field>
						<Button type="submit" disabled={change.isPending}>
							{change.isPending && <Spinner />}
							{hasPassword ? "Update password" : "Set password"}
						</Button>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}

function EmailTab({ plan }: { plan: "free" | "pro" | "team" }) {
	const navigate = useNavigate();
	const mailboxes = useMailboxes();
	const disconnect = useDisconnect();
	const connect = useStartConnect();
	const list = mailboxes.data ?? [];
	const atFreeLimit = plan === "free" && list.length >= 1;

	return (
		<div className="space-y-4">
			<div className="space-y-3">
				{list.map((m) => (
					<Card key={m.id}>
						<CardContent className="flex items-center justify-between gap-4 py-4">
							<div className="flex items-center gap-3">
								<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
									<Mail className="h-4 w-4 text-primary" />
								</div>
								<div className="space-y-1">
									<p className="font-medium">{m.emailAddress}</p>
									<div className="flex items-center gap-2">
										<Badge
											variant={m.status === "ready" ? "default" : "secondary"}
										>
											{m.status}
										</Badge>
										<span className="text-xs text-muted-foreground">
											{m.syncedCount} synced
										</span>
									</div>
								</div>
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={disconnect.isPending}
								onClick={() => {
									if (
										confirm(
											"Disconnect this mailbox? All synced messages will be purged.",
										)
									) {
										disconnect.mutate(m.id, {
											onSuccess: () => {
												if (list.length === 1) navigate({ to: "/onboarding" });
											},
										});
									}
								}}
							>
								Disconnect
							</Button>
						</CardContent>
					</Card>
				))}
				{list.length === 0 && (
					<p className="text-sm text-muted-foreground">No mailboxes connected.</p>
				)}
			</div>

			{atFreeLimit ? (
				<div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-4 text-sm">
					<p className="font-medium">Want more than one mailbox?</p>
					<p className="mt-1 text-muted-foreground">
						The free plan includes one mailbox. Upgrade to Pro to connect your
						work and other accounts.
					</p>
					<Button className="mt-3" size="sm" disabled>
						Upgrade (coming soon)
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={connect.isPending}
						onClick={() => connect.mutate()}
					>
						{connect.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
						Connect Gmail
					</Button>
					<ImapConnectDialog />
				</div>
			)}
		</div>
	);
}
