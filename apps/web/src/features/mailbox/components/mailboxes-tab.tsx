import type { MailboxSummary } from "@postscript/types";
import { Mail, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useConfig } from "@/features/auth/hooks";
import { Section } from "@/features/settings/section";
import { getApiError } from "@/lib/api-client";
import { useDisconnect, useMailboxes, useStartConnect, useSyncMailbox, useUpdateMailbox } from "../hooks";
import { ImapConnectDialog } from "./imap-connect-dialog";

const STATUS: Record<MailboxSummary["status"], string> = {
	pending: "Waiting to sync",
	syncing: "Syncing",
	ready: "Up to date",
	error: "Sync problem",
};

export function MailboxesTab() {
	const mailboxes = useMailboxes();
	const config = useConfig();
	const connect = useStartConnect();
	const gmailOn = Boolean(config.data?.features.gmail);
	return (
		<div className="divide-y divide-white/[0.06]">
			<Section title="Connected mailboxes" description="Postscript reads your mail live from your provider. Disconnecting deletes everything we stored for that mailbox.">
				{mailboxes.isLoading ? (
					<Spinner className="h-5 w-5" />
				) : (
					<div className="space-y-6" data-testid="mailboxes-list">
						{(mailboxes.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No mailboxes connected yet.</p>}
						{mailboxes.data?.map((m) => <MailboxRow key={m.id} m={m} />)}
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								data-testid="connect-gmail"
								disabled={!gmailOn || connect.isPending}
								title={gmailOn ? undefined : "Gmail is not configured on this server yet"}
								onClick={() => connect.mutate(undefined, { onError: (err) => getApiError(err).status !== 402 && toast.error(getApiError(err).message) })}
							>
								{connect.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
								{gmailOn ? "Connect Gmail" : "Gmail (not configured)"}
							</Button>
							<ImapConnectDialog />
						</div>
					</div>
				)}
			</Section>
		</div>
	);
}

function MailboxRow({ m }: { m: MailboxSummary }) {
	const update = useUpdateMailbox();
	const disconnect = useDisconnect();
	const sync = useSyncMailbox();
	const [name, setName] = useState(m.displayName ?? "");
	const [sig, setSig] = useState(m.signatureHtml ?? "");
	const dirty = name !== (m.displayName ?? "") || sig !== (m.signatureHtml ?? "");
	return (
		<div className="rounded-xl bg-white/[0.025] p-4" data-testid="mailbox-row">
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
					<Mail className="h-4 w-4 text-primary" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium">{m.emailAddress}</p>
					<p className="text-xs text-muted-foreground">
						{m.provider === "gmail" ? "Gmail" : "IMAP"} · {STATUS[m.status]}
						{m.status === "error" && m.error ? `: ${m.error}` : ""} · {m.syncedCount} messages
					</p>
				</div>
				<Button variant="ghost" size="sm" onClick={() => sync.mutate(m.id)} disabled={sync.isPending}>
					Sync now
				</Button>
				<Button
					variant="outline"
					size="sm"
					data-testid="disconnect-mailbox"
					disabled={disconnect.isPending}
					onClick={() => {
						if (window.confirm(`Disconnect ${m.emailAddress}? Everything Postscript stored for it is deleted. Your mail stays with your provider.`)) {
							disconnect.mutate(m.id, { onSuccess: () => toast.success("Mailbox disconnected") });
						}
					}}
				>
					Disconnect
				</Button>
			</div>
			<div className="mt-4 grid gap-3 sm:grid-cols-[200px_1fr]">
				<label className="text-sm text-muted-foreground" htmlFor={`dn-${m.id}`}>Sender name</label>
				<Input id={`dn-${m.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={120} />
				<label className="text-sm text-muted-foreground" htmlFor={`sig-${m.id}`}>Signature</label>
				<Textarea
					id={`sig-${m.id}`}
					data-testid="signature-input"
					value={sig}
					onChange={(e) => setSig(e.target.value)}
					placeholder="Added to new messages from this address. Simple HTML is fine."
					rows={3}
				/>
			</div>
			{dirty && (
				<div className="mt-3 flex justify-end">
					<Button
						size="sm"
						disabled={update.isPending}
						onClick={() =>
							update.mutate(
								{ id: m.id, displayName: name.trim() || null, signatureHtml: sig.trim() ? (sig.includes("<") ? sig : sig.replace(/\n/g, "<br>")) : null },
								{ onSuccess: () => toast.success("Saved"), onError: (err) => toast.error(getApiError(err).message) },
							)
						}
					>
						Save
					</Button>
				</div>
			)}
		</div>
	);
}
