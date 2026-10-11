import type { MeResponse } from "@postscript/types";
import { useNavigate } from "@tanstack/react-router";
import { Download } from "lucide-react";
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
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/features/auth/api";
import { AuthError } from "@/features/auth/components/auth-error";
import { useChangePassword, useUpdateProfile } from "@/features/auth/hooks";
import { getApiError } from "@/lib/api-client";
import { Section } from "./section";

export function AccountTab({ me }: { me: MeResponse }) {
	return (
		<div className="divide-y divide-white/[0.06]">
			<ProfileSection me={me} />
			<PasswordSection hasPassword={me.user.hasPassword} />
			<ExportSection />
			<DeleteSection hasPassword={me.user.hasPassword} />
		</div>
	);
}

function ProfileSection({ me }: { me: MeResponse }) {
	const update = useUpdateProfile();
	const [name, setName] = useState(me.user.fullName);
	return (
		<Section title="Profile" description="Your name is shown to people in your workspaces.">
			<form
				className="max-w-sm space-y-3"
				onSubmit={(e) => {
					e.preventDefault();
					update.mutate(name.trim(), { onSuccess: () => toast.success("Profile saved") });
				}}
			>
				<Field>
					<FieldLabel htmlFor="fullName">Full name</FieldLabel>
					<Input id="fullName" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
				</Field>
				<Field>
					<FieldLabel htmlFor="email">Email</FieldLabel>
					<Input id="email" value={me.user.email} disabled />
					{!me.user.emailVerified && <p className="text-xs text-muted-foreground">Not verified yet.</p>}
				</Field>
				<AuthError error={update.error} />
				<Button type="submit" disabled={update.isPending || !name.trim() || name.trim() === me.user.fullName}>
					{update.isPending && <Spinner />}
					Save
				</Button>
			</form>
		</Section>
	);
}

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
	const change = useChangePassword();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [localError, setLocalError] = useState<string | null>(null);
	return (
		<Section title={hasPassword ? "Password" : "Set a password"} description={hasPassword ? "Change the password you sign in with." : "You signed up with Google. Set a password to also sign in with email."}>
			<form
				className="max-w-sm"
				onSubmit={(e) => {
					e.preventDefault();
					setLocalError(null);
					if (next.length < 8) return setLocalError("Use at least 8 characters.");
					if (next !== confirm) return setLocalError("The passwords don't match.");
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
				}}
			>
				<FieldGroup>
					<AuthError error={change.error} />
					{localError && <p className="text-sm text-destructive">{localError}</p>}
					{hasPassword && (
						<Field>
							<FieldLabel htmlFor="current">Current password</FieldLabel>
							<PasswordInput id="current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
						</Field>
					)}
					<Field>
						<FieldLabel htmlFor="new">New password</FieldLabel>
						<PasswordInput id="new" autoComplete="new-password" placeholder="At least 8 characters" value={next} onChange={(e) => setNext(e.target.value)} />
					</Field>
					<Field>
						<FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
						<PasswordInput id="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
					</Field>
					<Button type="submit" disabled={change.isPending}>
						{change.isPending && <Spinner />}
						{hasPassword ? "Update password" : "Set password"}
					</Button>
				</FieldGroup>
			</form>
		</Section>
	);
}

function ExportSection() {
	const [busy, setBusy] = useState(false);
	return (
		<Section title="Your data" description="Download everything Postscript stores about you as a JSON file. Email bodies are not included because we never store them.">
			<Button
				variant="outline"
				data-testid="export-data"
				disabled={busy}
				onClick={async () => {
					setBusy(true);
					try {
						const blob = await authApi.exportData();
						const url = URL.createObjectURL(blob);
						const a = document.createElement("a");
						a.href = url;
						a.download = `postscript-export-${new Date().toISOString().slice(0, 10)}.json`;
						a.click();
						setTimeout(() => URL.revokeObjectURL(url), 5000);
					} catch (err) {
						toast.error(getApiError(err).message);
					} finally {
						setBusy(false);
					}
				}}
			>
				{busy ? <Spinner /> : <Download className="h-4 w-4" />}
				Export my data
			</Button>
		</Section>
	);
}

function DeleteSection({ hasPassword }: { hasPassword: boolean }) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	return (
		<Section title="Delete account" description="This removes your account, your workspaces you own, every connected mailbox and all stored data. It cannot be undone.">
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button variant="destructive" data-testid="delete-account-open">Delete my account</Button>
				</DialogTrigger>
				<DialogContent className="dark text-foreground sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Delete your account?</DialogTitle>
						<DialogDescription>
							Type DELETE to confirm. Your mail stays with your provider; only Postscript's copy of your data is removed.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<Input data-testid="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" />
						{hasPassword && <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />}
						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>
					<DialogFooter>
						<Button
							variant="destructive"
							data-testid="delete-account-confirm"
							disabled={typed !== "DELETE" || (hasPassword && !password) || busy}
							onClick={async () => {
								setBusy(true);
								setError(null);
								try {
									await authApi.deleteAccount(hasPassword ? password : undefined);
									navigate({ to: "/" });
								} catch (err) {
									setError(getApiError(err).message);
									setBusy(false);
								}
							}}
						>
							{busy && <Spinner />}
							Delete forever
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Section>
	);
}
