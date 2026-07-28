import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { AuthError } from "@/features/auth/components/auth-error";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { GoogleButton } from "@/features/auth/components/google-button";
import { useLogin } from "@/features/auth/hooks";
import { type LoginInput, loginSchema } from "@/features/auth/schemas";
import { getApiError } from "@/lib/api-client";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const login = useLogin();
	const form = useForm<LoginInput>({
		resolver: zodResolver(loginSchema),
		defaultValues: { email: "", password: "" },
	});

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			await login.mutateAsync(values);
			navigate({ to: "/app" });
		} catch (err) {
			// Unverified accounts get bounced to the verify screen.
			if (getApiError(err).code === "email_unverified") {
				navigate({ to: "/verify-email", search: { email: values.email } });
			}
		}
	});

	return (
		<AuthShell>
			<header className="mb-8">
				<h2 className="font-display text-3xl tracking-tight">Welcome back</h2>
				<p className="mt-1.5 text-sm text-muted-foreground">
					Sign in to your Postscript inbox.
				</p>
			</header>

			<GoogleButton />

			<div className="my-6 flex items-center gap-3">
				<Separator className="flex-1" />
				<span className="text-xs text-muted-foreground">or</span>
				<Separator className="flex-1" />
			</div>

			<form onSubmit={onSubmit} noValidate>
				<FieldGroup>
					{login.error && getApiError(login.error).code !== "email_unverified" && (
						<AuthError error={login.error} />
					)}

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

					<Field data-invalid={!!form.formState.errors.password}>
						<div className="flex items-center justify-between">
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Link
								to="/forgot-password"
								className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
							>
								Forgot?
							</Link>
						</div>
						<PasswordInput
							id="password"
							autoComplete="current-password"
							placeholder="••••••••"
							aria-invalid={!!form.formState.errors.password}
							{...form.register("password")}
						/>
						{form.formState.errors.password && (
							<FieldError>{form.formState.errors.password.message}</FieldError>
						)}
					</Field>

					<Button type="submit" className="w-full" disabled={login.isPending}>
						{login.isPending && <Spinner />}
						Sign in
					</Button>
				</FieldGroup>
			</form>

			<p className="mt-8 text-center text-sm text-muted-foreground">
				New to Postscript?{" "}
				<Link
					to="/register"
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					Create an account
				</Link>
			</p>
		</AuthShell>
	);
}
