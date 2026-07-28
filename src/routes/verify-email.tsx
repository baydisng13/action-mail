import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, MailCheck, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthError } from "@/features/auth/components/auth-error";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { useResendVerification, useVerifyEmail } from "@/features/auth/hooks";

const searchSchema = z.object({
	token: z.string().optional(),
	email: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
	validateSearch: searchSchema,
	component: VerifyEmailPage,
});

function VerifyEmailPage() {
	const { token, email } = Route.useSearch();
	return (
		<AuthShell>
			{token ? <TokenVerify token={token} /> : <CheckInbox email={email} />}
		</AuthShell>
	);
}

/** Landed from the email link — verify the token, then route to login. */
function TokenVerify({ token }: { token: string }) {
	const navigate = useNavigate();
	const verify = useVerifyEmail();
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		verify.mutate(token, {
			onSuccess: () => setTimeout(() => navigate({ to: "/login" }), 1500),
		});
	}, [token, verify, navigate]);

	if (verify.isError) {
		return (
			<Centered
				icon={<XCircle className="h-6 w-6 text-destructive" />}
				title="Verification failed"
			>
				<AuthError error={verify.error} />
				<Button asChild variant="outline" className="mt-2 w-full">
					<Link to="/login">Back to sign in</Link>
				</Button>
			</Centered>
		);
	}

	if (verify.isSuccess) {
		return (
			<Centered
				icon={<CheckCircle2 className="h-6 w-6 text-primary" />}
				title="Email verified"
				subtitle="Taking you to sign in…"
			/>
		);
	}

	return (
		<Centered
			icon={<Spinner className="h-6 w-6" />}
			title="Verifying your email"
			subtitle="One moment."
		/>
	);
}

/** Post-registration — tell the user to check their inbox, allow resend. */
function CheckInbox({ email }: { email?: string }) {
	const resend = useResendVerification();
	return (
		<Centered
			icon={<MailCheck className="h-6 w-6 text-primary" />}
			title="Check your inbox"
			subtitle={
				email
					? `We sent a verification link to ${email}.`
					: "We sent you a verification link."
			}
		>
			<p className="text-sm text-muted-foreground">
				Click the link to activate your account. Didn't get it?
			</p>
			{resend.isSuccess ? (
				<p className="text-sm text-primary">Sent — check again in a moment.</p>
			) : (
				<Button
					variant="outline"
					className="w-full"
					disabled={!email || resend.isPending}
					onClick={() => email && resend.mutate(email)}
				>
					{resend.isPending && <Spinner />}
					Resend verification email
				</Button>
			)}
			<Button asChild variant="ghost" className="w-full">
				<Link to="/login">Back to sign in</Link>
			</Button>
		</Centered>
	);
}

function Centered({
	icon,
	title,
	subtitle,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	subtitle?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col items-center text-center">
			<div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
				{icon}
			</div>
			<h2 className="font-display text-2xl tracking-tight">{title}</h2>
			{subtitle && (
				<p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
			)}
			{children && (
				<div className="mt-6 flex w-full flex-col gap-3">{children}</div>
			)}
		</div>
	);
}
