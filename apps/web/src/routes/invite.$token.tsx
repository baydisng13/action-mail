import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/features/auth/api";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { useSessionBootstrap } from "@/features/auth/use-session";
import { getApiError } from "@/lib/api-client";

export const Route = createFileRoute("/invite/$token")({
	component: InvitePage,
});

function InvitePage() {
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const { ready, authed } = useSessionBootstrap();
	const preview = useQuery({ queryKey: ["invite", token], queryFn: () => authApi.invitePreview(token), retry: false });
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const here = `/invite/${token}`;

	const accept = async () => {
		setBusy(true);
		setError(null);
		try {
			await authApi.acceptInvite(token);
			window.location.assign("/app/settings?tab=workspace");
		} catch (err) {
			setError(getApiError(err).message);
			setBusy(false);
		}
	};

	useEffect(() => {
		if (preview.isError && getApiError(preview.error).status === 404) setError("This invite link is not valid.");
	}, [preview.isError, preview.error]);

	return (
		<AuthShell>
			{!ready || preview.isLoading ? (
				<div className="flex justify-center"><Spinner className="h-6 w-6" /></div>
			) : !preview.data ? (
				<div>
					<h2 className="font-display text-3xl tracking-tight">Invite not found</h2>
					<p className="mt-2 text-sm text-muted-foreground">{error ?? getApiError(preview.error).message}</p>
					<Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
				</div>
			) : (
				<div data-testid="invite-page">
					<h2 className="font-display text-3xl tracking-tight">Join {preview.data.organizationName}</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						{preview.data.invitedBy ? `${preview.data.invitedBy} invited ` : "You were invited as "}
						<span className="text-foreground">{preview.data.email}</span>
						{preview.data.invitedBy ? ` as ${preview.data.role === "admin" ? "an admin" : "a member"}.` : "."}
					</p>
					{preview.data.expired ? (
						<p className="mt-6 text-sm text-destructive">This invite has expired. Ask for a new one.</p>
					) : authed ? (
						<>
							{error && <p className="mt-4 text-sm text-destructive">{error}</p>}
							<Button className="mt-6 w-full" onClick={accept} disabled={busy} data-testid="accept-invite">
								{busy && <Spinner />}
								Accept invite
							</Button>
						</>
					) : (
						<div className="mt-6 space-y-2">
							<Button className="w-full" onClick={() => navigate({ to: "/register", search: { redirect: here, email: preview.data?.email } })}>
								Create an account to join
							</Button>
							<Button variant="outline" className="w-full" onClick={() => navigate({ to: "/login", search: { redirect: here } })}>
								I already have an account
							</Button>
						</div>
					)}
				</div>
			)}
		</AuthShell>
	);
}
