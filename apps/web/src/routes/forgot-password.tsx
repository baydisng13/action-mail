import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AuthError } from "@/features/auth/components/auth-error";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { useForgotPassword } from "@/features/auth/hooks";
import {
	type ForgotPasswordInput,
	forgotPasswordSchema,
} from "@/features/auth/schemas";

export const Route = createFileRoute("/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const forgot = useForgotPassword();
	const form = useForm<ForgotPasswordInput>({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: { email: "" },
	});

	const onSubmit = form.handleSubmit((values) => forgot.mutate(values));

	if (forgot.isSuccess) {
		return (
			<AuthShell>
				<div className="flex flex-col items-center text-center">
					<div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
						<MailCheck className="h-6 w-6 text-primary" />
					</div>
					<h2 className="font-display text-2xl tracking-tight">Check your inbox</h2>
					<p className="mt-1.5 text-sm text-muted-foreground">
						If an account exists for that email, a reset link is on its way.
					</p>
					<Button asChild variant="ghost" className="mt-6 w-full">
						<Link to="/login">Back to sign in</Link>
					</Button>
				</div>
			</AuthShell>
		);
	}

	return (
		<AuthShell>
			<header className="mb-8">
				<h2 className="font-display text-3xl tracking-tight">
					Reset your password
				</h2>
				<p className="mt-1.5 text-sm text-muted-foreground">
					Enter your email and we'll send you a reset link.
				</p>
			</header>

			<form onSubmit={onSubmit} noValidate>
				<FieldGroup>
					<AuthError error={forgot.error} />
					<Field data-invalid={!!form.formState.errors.email}>
						<FieldLabel htmlFor="email">Email</FieldLabel>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							placeholder="you@company.com"
							aria-invalid={!!form.formState.errors.email}
							{...form.register("email")}
						/>
						{form.formState.errors.email && (
							<FieldError>{form.formState.errors.email.message}</FieldError>
						)}
					</Field>
					<Button type="submit" className="w-full" disabled={forgot.isPending}>
						{forgot.isPending && <Spinner />}
						Send reset link
					</Button>
				</FieldGroup>
			</form>

			<p className="mt-8 text-center text-sm text-muted-foreground">
				Remembered it?{" "}
				<Link
					to="/login"
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					Sign in
				</Link>
			</p>
		</AuthShell>
	);
}
