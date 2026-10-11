import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Lock, Mail } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthError } from "@/features/auth/components/auth-error";
import { Wordmark } from "@/features/auth/components/wordmark";
import { useLogout } from "@/features/auth/hooks";
import { useSessionBootstrap } from "@/features/auth/use-session";
import { useConfig } from "@/features/auth/hooks";
import { ImapConnectDialog } from "@/features/mailbox/components/imap-connect-dialog";
import { useMailboxes, useStartConnect } from "@/features/mailbox/hooks";
import { Link } from "@tanstack/react-router";

const ERRORS: Record<string, string> = {
	denied: "Gmail access was denied. Try again to connect your inbox.",
	state: "The connection expired. Please try connecting again.",
	limit: "Your plan's mailbox limit is reached. Upgrade to add another.",
	connect: "Something went wrong connecting Gmail. Try again.",
	unconfigured: "Gmail connect is not set up on this server yet. Use IMAP instead.",
};

export const Route = createFileRoute("/onboarding/")({
	validateSearch: z.object({ error: z.string().optional() }),
	component: OnboardingPage,
});


function OnboardingPage() {
	const { error } = Route.useSearch();
	const navigate = useNavigate();
	const logout = useLogout();
	const { ready, authed } = useSessionBootstrap();
	const mailboxes = useMailboxes({ enabled: authed });
	const connect = useStartConnect();
	const config = useConfig();
	const gmailOn = Boolean(config.data?.features.gmail);

	useEffect(() => {
		if (ready && !authed) navigate({ to: "/login" });
	}, [ready, authed, navigate]);

	const existing = mailboxes.data?.[0];

	// Already connected → go straight to the app; the backfill runs in the
	// background there (shown as a non-blocking banner).
	useEffect(() => {
		if (existing) navigate({ to: "/app" });
	}, [existing, navigate]);

	if (!ready) {
		return (
			<Screen>
				<div className="flex justify-center">
					<Spinner className="h-6 w-6" />
				</div>
			</Screen>
		)
	}

	return (
		<Screen>
			<div className="animate-rise">
				<p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
					One last step
				</p>
				<h1 className="font-display text-4xl tracking-tight sm:text-5xl">
					Connect your inbox
				</h1>
				<p className="mt-3 max-w-md text-muted-foreground">
					Postscript reads, threads, and drafts on top of your existing email.
					Your mail stays with your provider. Postscript reads it live and never keeps the content.
				</p>

				{error && ERRORS[error] && (
					<Alert variant="destructive" className="mt-6">
						<AlertDescription>{ERRORS[error]}</AlertDescription>
					</Alert>
				)}
				<div className="mt-6">
					<AuthError error={connect.error} />
				</div>

				{/* Gmail, active */}
				<div className="mt-6 space-y-3">
					{existing?.status === "ready" ? (
						<GmailConnectedCard
							email={existing.emailAddress}
							onGo={() => navigate({ to: "/app" })}
						/>
					) : (
						<button
							type="button"
							data-testid="connect-gmail"
							disabled={connect.isPending || !gmailOn}
							onClick={() => connect.mutate()}
							className="group flex w-full items-center gap-4 rounded-2xl bg-white/[0.03] p-5 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-60"
						>
							<GmailGlyph />
							<div className="flex-1">
								<div className="flex items-center gap-2 font-medium">
									Gmail
									{!gmailOn && (
										<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
											not configured
										</span>
									)}
								</div>
								<p className="text-sm text-muted-foreground">
									Connect with Google · read &amp; modify scopes
								</p>
							</div>
							{connect.isPending ? (
								<Spinner className="h-5 w-5" />
							) : (
								<ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
							)}
						</button>
					)}

					<ImapConnectDialog
						onConnected={() => navigate({ to: "/app" })}
						trigger={
							<button
								type="button"
								data-testid="connect-imap"
								className="group flex w-full items-center gap-4 rounded-2xl bg-white/[0.03] p-5 text-left transition-colors hover:bg-white/[0.06]"
							>
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
									<Mail className="h-5 w-5 text-primary" />
								</div>
								<div className="flex-1">
									<div className="font-medium">Any other email (IMAP)</div>
									<p className="text-sm text-muted-foreground">Outlook, Zoho, Yahoo, iCloud, cPanel and more</p>
								</div>
								<ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
							</button>
						}
					/>
				</div>

				<div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
					<Lock className="h-3.5 w-3.5 text-primary" />
					Passwords and tokens are encrypted. We never store your email bodies.
				</div>

				<div className="mt-8 flex items-center justify-between border-t border-white/5 pt-6 text-sm">
					<Link to="/app/settings" data-testid="onboarding-skip" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
						Skip for now
					</Link>
					<button
						type="button"
						className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						onClick={async () => {
							await logout.mutateAsync();
							navigate({ to: "/login" });
						}}
					>
						Sign out
					</button>
				</div>
			</div>
		</Screen>
	)
}

function GmailConnectedCard({
	email,
	onGo,
}: {
	email: string;
	onGo: () => void;
}) {
	return (
		<div className="flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-primary/[0.06] p-5">
			<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
				<Check className="h-5 w-5 text-primary" />
			</div>
			<div className="flex-1">
				<div className="font-medium">{email}</div>
				<p className="text-sm text-muted-foreground">Connected &amp; synced</p>
			</div>
			<Button onClick={onGo}>
				Open inbox
				<ArrowRight className="h-4 w-4" />
			</Button>
		</div>
	)
}

function Screen({ children }: { children: React.ReactNode }) {
	return (
		<div className="auth-atmosphere grain dark relative min-h-svh bg-background text-foreground">
			<div className="relative mx-auto flex min-h-svh max-w-2xl flex-col px-6 py-10">
				<Wordmark />
				<div className="flex flex-1 items-center py-12">
					<div className="w-full">{children}</div>
				</div>
			</div>
		</div>
	)
}

function GmailGlyph() {
	return (
		<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
			<svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
				<path fill="#EA4335" d="M5 5h14a2 2 0 0 1 2 2v.4L12 13 3 7.4V7a2 2 0 0 1 2-2Z" />
				<path
					fill="#34A853"
					d="M3 9.2V17a2 2 0 0 0 2 2h2V11.3L3 9.2Z"
				/>
				<path fill="#FBBC04" d="M21 9.2 17 11.3V19h2a2 2 0 0 0 2-2V9.2Z" />
			</svg>
		</div>
	)
}
