import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
import { type ImapConnectInput, imapConnectSchema, IMAP_PRESETS } from "../schemas";

export function ImapConnectDialog({ onConnected }: { onConnected?: () => void }) {
	const [open, setOpen] = useState(false);
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

	const applyPreset = (key: string) => {
		const p = IMAP_PRESETS[key];
		if (!p) return;
		form.setValue("imapHost", p.imapHost);
		form.setValue("imapPort", p.imapPort);
		form.setValue("smtpHost", p.smtpHost);
		form.setValue("smtpPort", p.smtpPort);
	};

	const submit = form.handleSubmit((values) => {
		connect.mutate(values, {
			onSuccess: () => {
				toast.success("Mailbox connected — syncing now");
				setOpen(false);
				form.reset();
				onConnected?.();
			},
		});
	});

	const err = form.formState.errors;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Plus className="h-4 w-4" />
					Connect via IMAP
				</Button>
			</DialogTrigger>
			<DialogContent className="dark max-h-[90svh] overflow-y-auto text-foreground sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Connect a mailbox</DialogTitle>
					<DialogDescription>
						Works with Zoho, Outlook, Yahoo, cPanel, and any IMAP host.
					</DialogDescription>
				</DialogHeader>

				<div className="mb-1 flex flex-wrap gap-1.5">
					{Object.entries(IMAP_PRESETS).map(([key, p]) => (
						<button
							key={key}
							type="button"
							onClick={() => applyPreset(key)}
							className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
						>
							{p.label}
						</button>
					))}
				</div>

				<form onSubmit={submit} className="space-y-3">
					<AuthError error={connect.error} />
					<Field data-invalid={!!err.emailAddress}>
						<FieldLabel htmlFor="im-email">Email address</FieldLabel>
						<Input id="im-email" type="email" placeholder="you@company.com" {...form.register("emailAddress")} />
						{err.emailAddress && <FieldError>{err.emailAddress.message}</FieldError>}
					</Field>

					<div className="grid grid-cols-[1fr_auto] gap-2">
						<Field data-invalid={!!err.imapHost}>
							<FieldLabel htmlFor="im-ih">IMAP host</FieldLabel>
							<Input id="im-ih" placeholder="imap.host.com" {...form.register("imapHost")} />
							{err.imapHost && <FieldError>{err.imapHost.message}</FieldError>}
						</Field>
						<Field className="w-20" data-invalid={!!err.imapPort}>
							<FieldLabel htmlFor="im-ip">Port</FieldLabel>
							<Input id="im-ip" type="number" {...form.register("imapPort", { valueAsNumber: true })} />
						</Field>
					</div>

					<div className="grid grid-cols-[1fr_auto] gap-2">
						<Field data-invalid={!!err.smtpHost}>
							<FieldLabel htmlFor="im-sh">SMTP host</FieldLabel>
							<Input id="im-sh" placeholder="smtp.host.com" {...form.register("smtpHost")} />
							{err.smtpHost && <FieldError>{err.smtpHost.message}</FieldError>}
						</Field>
						<Field className="w-20" data-invalid={!!err.smtpPort}>
							<FieldLabel htmlFor="im-sp">Port</FieldLabel>
							<Input id="im-sp" type="number" {...form.register("smtpPort", { valueAsNumber: true })} />
						</Field>
					</div>

					<Field data-invalid={!!err.username}>
						<FieldLabel htmlFor="im-user">Username</FieldLabel>
						<Input id="im-user" placeholder="usually your email" {...form.register("username")} />
						{err.username && <FieldError>{err.username.message}</FieldError>}
					</Field>
					<Field data-invalid={!!err.password}>
						<FieldLabel htmlFor="im-pass">Password</FieldLabel>
						<PasswordInput id="im-pass" placeholder="mailbox or app password" {...form.register("password")} />
						{err.password && <FieldError>{err.password.message}</FieldError>}
					</Field>

					<p className="text-xs text-muted-foreground">
						Many providers require an app-specific password. Stored encrypted.
					</p>

					<Button type="submit" className="w-full" disabled={connect.isPending}>
						{connect.isPending ? "Connecting…" : "Connect & sync"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
