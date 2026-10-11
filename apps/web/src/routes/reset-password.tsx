import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { AuthError } from "@/features/auth/components/auth-error";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { useResetPassword } from "@/features/auth/hooks";
import { passwordSchema } from "@/features/auth/schemas";

export const Route = createFileRoute("/reset-password")({
	validateSearch: z.object({ token: z.string().optional() }),
	component: ResetPasswordPage,
});

const formSchema = z
	.object({
		password: passwordSchema,
		confirm: z.string().min(1, "Confirm your password"),
	})
	.refine((v) => v.password === v.confirm, {
		message: "Passwords don't match",
		path: ["confirm"],
	});
type FormValues = z.infer<typeof formSchema>;

function ResetPasswordPage() {
	const { token } = Route.useSearch();
	const navigate = useNavigate();
	const reset = useResetPassword();
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { password: "", confirm: "" },
	});

	const onSubmit = form.handleSubmit(async (values) => {
		if (!token) return;
		await reset.mutateAsync({ token, password: values.password });
		setTimeout(() => navigate({ to: "/login" }), 1500);
	});

	if (!token) {
		return (
			<AuthShell>
				<div className="text-center">
					<h2 className="font-display text-2xl tracking-tight">Invalid link</h2>
					<p className="mt-1.5 text-sm text-muted-foreground">
						This reset link is missing or malformed. Request a new one.
					</p>
					<Button asChild variant="outline" className="mt-6 w-full">
						<Link to="/forgot-password">Request a new link</Link>
					</Button>
				</div>
			</AuthShell>
		);
	}

	if (reset.isSuccess) {
		return (
			<AuthShell>
				<div className="flex flex-col items-center text-center">
					<div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
						<CheckCircle2 className="h-6 w-6 text-primary" />
					</div>
					<h2 className="font-display text-2xl tracking-tight">
						Password updated
					</h2>
					<p className="mt-1.5 text-sm text-muted-foreground">
						Taking you to sign in…
					</p>
				</div>
			</AuthShell>
		);
	}

	return (
		<AuthShell>
			<header className="mb-8">
				<h2 className="font-display text-3xl tracking-tight">
					Choose a new password
				</h2>
				<p className="mt-1.5 text-sm text-muted-foreground">
					Your other sessions will be signed out.
				</p>
			</header>

			<form onSubmit={onSubmit} noValidate>
				<FieldGroup>
					<AuthError error={reset.error} />
					<Field data-invalid={!!form.formState.errors.password}>
						<FieldLabel htmlFor="password">New password</FieldLabel>
						<PasswordInput
							id="password"
							autoComplete="new-password"
							placeholder="At least 8 characters"
							aria-invalid={!!form.formState.errors.password}
							{...form.register("password")}
						/>
						{form.formState.errors.password && (
							<FieldError>{form.formState.errors.password.message}</FieldError>
						)}
					</Field>
					<Field data-invalid={!!form.formState.errors.confirm}>
						<FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
						<PasswordInput
							id="confirm"
							autoComplete="new-password"
							placeholder="Re-enter your password"
							aria-invalid={!!form.formState.errors.confirm}
							{...form.register("confirm")}
						/>
						{form.formState.errors.confirm && (
							<FieldError>{form.formState.errors.confirm.message}</FieldError>
						)}
					</Field>
					<Button type="submit" className="w-full" disabled={reset.isPending}>
						{reset.isPending && <Spinner />}
						Update password
					</Button>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
