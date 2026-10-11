import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { AuthError } from "@/features/auth/components/auth-error";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { GoogleButton } from "@/features/auth/components/google-button";
import { useRegister } from "@/features/auth/hooks";
import { type RegisterInput, registerSchema } from "@/features/auth/schemas";

export const Route = createFileRoute("/register")({
	validateSearch: z.object({ redirect: z.string().optional(), email: z.string().optional() }),
	component: RegisterPage,
});

function RegisterPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const register = useRegister();
	const form = useForm<RegisterInput>({
		resolver: zodResolver(registerSchema),
		defaultValues: { fullName: "", email: search.email ?? "", password: "" },
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const res = await register.mutateAsync(values);
		if (res.accessToken) {
			// No email check needed: we are signed in already.
			if (search.redirect?.startsWith("/")) window.location.assign(search.redirect);
			else navigate({ to: "/onboarding" });
			return;
		}
		navigate({ to: "/verify-email", search: { email: values.email } });
	});

	return (
		<AuthShell>
			<header className="mb-8">
				<h2 className="font-display text-3xl tracking-tight">
					Create your account
				</h2>
				<p className="mt-1.5 text-sm text-muted-foreground">
					A personal workspace is set up for you automatically.
				</p>
			</header>

			<GoogleButton label="Sign up with Google" />


			<form onSubmit={onSubmit} noValidate data-testid="register-form">
				<FieldGroup>
					<AuthError error={register.error} />

					<Field data-invalid={!!form.formState.errors.fullName}>
						<FieldLabel htmlFor="fullName">Full name</FieldLabel>
						<Input
							id="fullName"
							autoComplete="name"
							placeholder="Ada Lovelace"
							aria-invalid={!!form.formState.errors.fullName}
							{...form.register("fullName")}
						/>
						{form.formState.errors.fullName && (
							<FieldError>{form.formState.errors.fullName.message}</FieldError>
						)}
					</Field>

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
						<FieldLabel htmlFor="password">Password</FieldLabel>
						<PasswordInput
							id="password"
							autoComplete="new-password"
							placeholder="At least 8 characters"
							aria-invalid={!!form.formState.errors.password}
							{...form.register("password")}
						/>
						{form.formState.errors.password ? (
							<FieldError>{form.formState.errors.password.message}</FieldError>
						) : (
							<FieldDescription>
								Use 8 or more characters.
							</FieldDescription>
						)}
					</Field>

					<Button
						type="submit"
						data-testid="register-submit"
						className="w-full"
						disabled={register.isPending}
					>
						{register.isPending && <Spinner />}
						Create account
					</Button>
				</FieldGroup>
			</form>

			<p className="mt-8 text-center text-sm text-muted-foreground">
				Already have an account?{" "}
				<Link
					to="/login"
					search={{ redirect: search.redirect }}
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					Sign in
				</Link>
			</p>
		</AuthShell>
	);
}
