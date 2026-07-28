import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
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
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { AuthError } from "@/features/auth/components/auth-error";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { GoogleButton } from "@/features/auth/components/google-button";
import { useRegister } from "@/features/auth/hooks";
import { type RegisterInput, registerSchema } from "@/features/auth/schemas";

export const Route = createFileRoute("/register")({
	component: RegisterPage,
});

function RegisterPage() {
	const navigate = useNavigate();
	const register = useRegister();
	const form = useForm<RegisterInput>({
		resolver: zodResolver(registerSchema),
		defaultValues: { fullName: "", email: "", password: "" },
	});

	const onSubmit = form.handleSubmit(async (values) => {
		await register.mutateAsync(values);
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

			<div className="my-6 flex items-center gap-3">
				<Separator className="flex-1" />
				<span className="text-xs text-muted-foreground">or</span>
				<Separator className="flex-1" />
			</div>

			<form onSubmit={onSubmit} noValidate>
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
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					Sign in
				</Link>
			</p>
		</AuthShell>
	);
}
