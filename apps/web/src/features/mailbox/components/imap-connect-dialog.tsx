import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ExternalLink, Info, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthError } from "@/features/auth/components/auth-error";
import { useConnectImap } from "../hooks";
import {
	type ImapConnectInput,
	imapConnectSchema,
	PROVIDER_PRESETS,
	type ProviderPreset,
} from "../schemas";

export function ImapConnectDialog({ onConnected, trigger }: { onConnected?: () => void; trigger?: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	const [provider, setProvider] = useState<ProviderPreset | null>(null);
	const connect = useConnectImap();
	const form = useForm<ImapConnectInput>({
		resolver: zodResolver(imapConnectSchema),
		defaultValues: {
			emailAddress: "",
			imapHost: "",
			imapPort: 993,
			smtpHost: "",
			smtpPort: 465,
			useTls: true,
			username: "",
			password: "",
		},
	});

	const pick = (p: ProviderPreset) => {
		form.reset({
			emailAddress: "",
			imapHost: p.imapHost,
			imapPort: p.imapPort,
			smtpHost: p.smtpHost,
			smtpPort: p.smtpPort,
			useTls: true,
			username: "",
			password: "",
		});
		setProvider(p);
	};

	const reset = () => {
		setProvider(null);
		connect.reset();
	};

	const close = (v: boolean) => {
		setOpen(v);
		if (!v) reset();
	};

	const submit = form.handleSubmit((values) => {
		connect.mutate(values, {
			onSuccess: () => {
				toast.success("Mailbox connected. Syncing now.");
				close(false);
				onConnected?.();
			},
		});
	});

	const err = form.formState.errors;

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button variant="outline" data-testid="connect-imap">
						<Plus className="h-4 w-4" />
						Connect IMAP mailbox
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="dark max-h-[90svh] overflow-y-auto text-foreground sm:max-w-md">
				{!provider ? (
					<>
						<DialogHeader>
							<DialogTitle>Choose your email provider</DialogTitle>
							<DialogDescription>
								Pick your provider and we fill in the right settings.
							</DialogDescription>
						</DialogHeader>
						<div className="grid grid-cols-2 gap-2">
							{PROVIDER_PRESETS.map((p) => (
								<button
									key={p.id}
									type="button"
									data-testid={`imap-provider-${p.id}`}
									onClick={() => pick(p)}
									className="rounded-xl bg-white/[0.04] p-4 text-left text-sm font-medium transition-colors hover:bg-white/[0.08]"
								>
									{p.label}
								</button>
							))}
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<button
								type="button"
								onClick={reset}
								className="mb-1 inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							>
								<ArrowLeft className="h-3.5 w-3.5" /> All providers
							</button>
							<DialogTitle>Connect {provider.label}</DialogTitle>
						</DialogHeader>

						<div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] p-3 text-xs text-muted-foreground">
							<Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
							<div>
								{provider.help}
								{provider.docsUrl && (
									<a
										href={provider.docsUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
									>
										Setup guide <ExternalLink className="h-3 w-3" />
									</a>
								)}
							</div>
						</div>

						<form onSubmit={submit} className="space-y-3">
							<AuthError error={connect.error} />
							<Field data-invalid={!!err.emailAddress}>
								<FieldLabel htmlFor="im-email">Email address</FieldLabel>
								<Input id="im-email" data-testid="imap-email" type="email" placeholder="you@company.com" {...form.register("emailAddress")} />
								{err.emailAddress && <FieldError>{err.emailAddress.message}</FieldError>}
							</Field>

							<div className="grid grid-cols-[1fr_auto] gap-2">
								<Field data-invalid={!!err.imapHost}>
									<FieldLabel htmlFor="im-ih">IMAP host</FieldLabel>
									<Input id="im-ih" data-testid="imap-host" placeholder="imap.host.com" {...form.register("imapHost")} />
									{err.imapHost && <FieldError>{err.imapHost.message}</FieldError>}
								</Field>
								<Field className="w-20">
									<FieldLabel htmlFor="im-ip">Port</FieldLabel>
									<Input id="im-ip" data-testid="imap-port" type="number" {...form.register("imapPort", { valueAsNumber: true })} />
								</Field>
							</div>

							<div className="grid grid-cols-[1fr_auto] gap-2">
								<Field data-invalid={!!err.smtpHost}>
									<FieldLabel htmlFor="im-sh">SMTP host</FieldLabel>
									<Input id="im-sh" data-testid="smtp-host" placeholder="smtp.host.com" {...form.register("smtpHost")} />
									{err.smtpHost && <FieldError>{err.smtpHost.message}</FieldError>}
								</Field>
								<Field className="w-20">
									<FieldLabel htmlFor="im-sp">Port</FieldLabel>
									<Input id="im-sp" data-testid="smtp-port" type="number" {...form.register("smtpPort", { valueAsNumber: true })} />
								</Field>
							</div>

							<label className="flex items-center gap-2 text-sm">
								<input type="checkbox" data-testid="imap-tls" className="h-4 w-4 accent-[var(--primary)]" {...form.register("useTls")} />
								Use SSL/TLS (recommended)
							</label>

							<Field data-invalid={!!err.username}>
								<FieldLabel htmlFor="im-user">Username</FieldLabel>
								<Input id="im-user" data-testid="imap-username" placeholder="usually your full email" {...form.register("username")} />
								{err.username && <FieldError>{err.username.message}</FieldError>}
							</Field>
							<Field data-invalid={!!err.password}>
								<FieldLabel htmlFor="im-pass">Password</FieldLabel>
								<PasswordInput id="im-pass" data-testid="imap-password" placeholder="app password (recommended)" {...form.register("password")} />
								{err.password && <FieldError>{err.password.message}</FieldError>}
							</Field>

							<Button type="submit" data-testid="imap-submit" className="w-full" disabled={connect.isPending}>
								{connect.isPending ? "Checking your details" : "Connect and sync"}
							</Button>
						</form>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
