import type { DraftContent, DraftView, MailboxSummary, UploadView } from "@postscript/types";
import { MAX_UPLOAD_BYTES } from "@postscript/types";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Maximize2, Minimize2, Paperclip, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useConfig } from "@/features/auth/hooks";
import { useMailboxes } from "@/features/mailbox/hooks";
import { getApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { mailApi } from "../api";
import { mailKeys } from "../hooks";
import { AddressInput } from "./address-input";
import { type ComposeRequest, useCompose } from "./compose-context";
import { RichEditor } from "./rich-editor";

type SaveState = "idle" | "saving" | "saved" | "error";

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Gmail-style compose panel. Lives in the app shell so you can keep reading. */
export function ComposeHost() {
	const { request, close, open } = useCompose();
	if (!request) return null;
	return <ComposeWindow key={request.key} request={request} onClose={close} reopen={open} />;
}

function withSignature(html: string, mailbox: MailboxSummary | undefined): string {
	const sig = mailbox?.signatureHtml?.trim();
	if (!sig) return html;
	const plain = sig.replace(/<[^>]+>/g, "").trim();
	if (plain && html.replace(/<[^>]+>/g, "").includes(plain)) return html;
	return `<p></p><p>-- </p>${sig}${html ? `<p></p>${html}` : ""}`;
}

function ComposeWindow({
	request,
	onClose,
	reopen,
}: {
	request: ComposeRequest;
	onClose: () => void;
	reopen: (r: ComposeRequest) => void;
}) {
	const qc = useQueryClient();
	const config = useConfig();
	const mailboxes = useMailboxes();
	const [draft, setDraft] = useState<DraftView | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [content, setContent] = useState<DraftContent | null>(null);
	const [uploads, setUploads] = useState<UploadView[]>([]);
	const [uploading, setUploading] = useState(0);
	const [showCc, setShowCc] = useState(false);
	const [save, setSave] = useState<SaveState>("idle");
	const [sending, setSending] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const dirty = useRef(false);
	const fileRef = useRef<HTMLInputElement>(null);

	// Load or create the draft.
	useEffect(() => {
		let alive = true;
		(async () => {
			try {
				const d = request.draftId
					? await mailApi.getDraft(request.draftId)
					: await mailApi.createDraft({ mode: request.mode, sourceMessageId: request.sourceMessageId, mailboxId: request.mailboxId });
				if (!alive) return;
				const mb = mailboxes.data?.find((m) => m.id === d.mailboxId);
				const html = !request.draftId && d.version <= 1 ? withSignature(d.html, mb) : d.html;
				setDraft(d);
				setUploads(d.uploads);
				setShowCc(d.cc.length > 0 || d.bcc.length > 0);
				setContent({
					mailboxId: d.mailboxId,
					to: d.to,
					cc: d.cc,
					bcc: d.bcc,
					subject: d.subject,
					html,
					uploadIds: d.uploads.map((u) => u.id),
					forwardAttachmentIds: d.forwardAttachments.map((a) => a.id),
				});
			} catch (err) {
				if (alive) setLoadError(getApiError(err).message);
			}
		})();
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const update = (patch: Partial<DraftContent>) => {
		dirty.current = true;
		setContent((c) => (c ? { ...c, ...patch } : c));
	};

	const persist = useCallback(async () => {
		if (!draft || !content || !dirty.current) return;
		dirty.current = false;
		setSave("saving");
		try {
			await mailApi.saveDraft(draft.id, content);
			setSave("saved");
		} catch {
			dirty.current = true;
			setSave("error");
		}
	}, [draft, content]);

	// Autosave 1.5s after the last change.
	useEffect(() => {
		if (!dirty.current) return;
		const t = setTimeout(persist, 1500);
		return () => clearTimeout(t);
	}, [persist]);

	const closeAndSave = async () => {
		await persist();
		qc.invalidateQueries({ queryKey: mailKeys.all });
		onClose();
	};

	const discard = async () => {
		if (draft) await mailApi.deleteDraft(draft.id).catch(() => undefined);
		qc.invalidateQueries({ queryKey: mailKeys.all });
		onClose();
		toast("Draft discarded");
	};

	const addFiles = async (files: FileList | null) => {
		if (!files) return;
		for (const file of Array.from(files)) {
			if (file.size > MAX_UPLOAD_BYTES) {
				toast.error(`${file.name} is too big. The limit is ${fmtSize(MAX_UPLOAD_BYTES)}.`);
				continue;
			}
			setUploading((n) => n + 1);
			try {
				const up = await mailApi.upload(file);
				setUploads((u) => [...u, up]);
				dirty.current = true;
				setContent((c) => (c ? { ...c, uploadIds: [...c.uploadIds, up.id] } : c));
			} catch (err) {
				toast.error(`Could not attach ${file.name}: ${getApiError(err).message}`);
			} finally {
				setUploading((n) => n - 1);
			}
		}
	};

	const send = async () => {
		if (!draft || !content) return;
		if (content.to.length + content.cc.length + content.bcc.length === 0) {
			toast.error("Add at least one recipient.");
			return;
		}
		setSending(true);
		try {
			const res = await mailApi.send(draft.id, content);
			onClose();
			const undoMs = (res.undoSeconds || config.data?.undoSendSeconds || 10) * 1000;
			const id = toast("Sending in a few seconds", {
				duration: undoMs,
				action: {
					label: "Undo",
					onClick: async () => {
						try {
							const { draftId } = await mailApi.undo(res.outboxId);
							toast.dismiss(id);
							toast("Sending cancelled");
							reopen({ mode: "edit", draftId });
						} catch (err) {
							toast.error(getApiError(err).message);
						}
					},
				},
			});
			setTimeout(() => qc.invalidateQueries({ queryKey: mailKeys.all }), undoMs + 3000);
		} catch (err) {
			toast.error(getApiError(err).message);
			setSending(false);
		}
	};

	const from = mailboxes.data ?? [];

	return (
		<div
			data-testid="compose-window"
			className={cn(
				"dark fixed inset-0 z-50 flex flex-col bg-[oklch(0.19_0.006_228)] text-foreground sm:inset-auto sm:right-4 sm:bottom-0 sm:rounded-t-xl sm:shadow-2xl sm:shadow-black/50",
				expanded ? "sm:top-8 sm:left-1/2 sm:w-[min(900px,calc(100vw-2rem))] sm:-translate-x-1/2" : "sm:h-[min(620px,85svh)] sm:w-[560px]",
			)}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					e.stopPropagation();
					closeAndSave();
				}
				if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
					e.preventDefault();
					send();
				}
			}}
		>
			<div className="flex items-center gap-2 px-4 py-2.5">
				<span className="flex-1 truncate text-sm font-medium">
					{draft?.mode === "reply" || draft?.mode === "replyAll" ? "Reply" : draft?.mode === "forward" ? "Forward" : "New message"}
				</span>
				<span className="text-xs text-muted-foreground" data-testid="compose-save-state">
					{save === "saving" ? "Saving" : save === "saved" ? "Saved" : save === "error" ? "Not saved" : ""}
				</span>
				<button type="button" aria-label={expanded ? "Shrink" : "Expand"} onClick={() => setExpanded((v) => !v)} className="hidden rounded p-1 text-muted-foreground hover:text-foreground sm:block">
					{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
				</button>
				<button type="button" aria-label="Close" data-testid="compose-close" onClick={closeAndSave} className="rounded p-1 text-muted-foreground hover:text-foreground">
					<X className="h-4 w-4" />
				</button>
			</div>

			{loadError ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
					<p className="text-destructive">{loadError}</p>
					<Button variant="outline" size="sm" onClick={onClose}>Close</Button>
				</div>
			) : !content || !draft ? (
				<div className="flex flex-1 items-center justify-center"><Spinner className="h-5 w-5" /></div>
			) : (
				<>
					<div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
						{from.length > 1 && (
							<label className="flex items-center gap-1.5 px-4 py-1.5">
								<span className="w-10 shrink-0 text-sm text-muted-foreground">From</span>
								<select
									data-testid="compose-from"
									value={content.mailboxId}
									onChange={(e) => update({ mailboxId: e.target.value })}
									className="flex-1 bg-transparent py-1 text-sm outline-none"
								>
									{from.map((m) => (
										<option key={m.id} value={m.id} className="bg-neutral-900">
											{m.displayName ? `${m.displayName} <${m.emailAddress}>` : m.emailAddress}
										</option>
									))}
								</select>
							</label>
						)}
						<div className="relative">
							<AddressInput label="To" value={content.to} onChange={(to) => update({ to })} autoFocus={draft.mode === "new" || draft.mode === "forward"} testId="compose-to" />
							{!showCc && (
								<button type="button" onClick={() => setShowCc(true)} className="absolute top-2.5 right-4 text-xs text-muted-foreground hover:text-foreground">
									Cc Bcc
								</button>
							)}
						</div>
						{showCc && (
							<>
								<AddressInput label="Cc" value={content.cc} onChange={(cc) => update({ cc })} testId="compose-cc" />
								<AddressInput label="Bcc" value={content.bcc} onChange={(bcc) => update({ bcc })} testId="compose-bcc" />
							</>
						)}
						<input
							data-testid="compose-subject"
							value={content.subject}
							onChange={(e) => update({ subject: e.target.value })}
							placeholder="Subject"
							className="w-full bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60"
						/>
					</div>

					<RichEditor value={content.html} resetKey={draft.id} onChange={(html) => update({ html })} />

					{(uploads.length > 0 || draft.forwardAttachments.length > 0 || uploading > 0) && (
						<div className="flex flex-wrap gap-1.5 px-4 pb-2" data-testid="compose-attachments">
							{draft.forwardAttachments
								.filter((a) => content.forwardAttachmentIds.includes(a.id))
								.map((a) => (
									<Chip key={a.id} name={a.filename} size={a.size} onRemove={() => update({ forwardAttachmentIds: content.forwardAttachmentIds.filter((x) => x !== a.id) })} />
								))}
							{uploads
								.filter((u) => content.uploadIds.includes(u.id))
								.map((u) => (
									<Chip key={u.id} name={u.filename} size={u.size} onRemove={() => update({ uploadIds: content.uploadIds.filter((x) => x !== u.id) })} />
								))}
							{uploading > 0 && (
								<span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-1 text-xs text-muted-foreground">
									<Loader2 className="h-3 w-3 animate-spin" /> Uploading
								</span>
							)}
						</div>
					)}

					<div className="flex items-center gap-2 px-3 py-2.5">
						<Button data-testid="compose-send" onClick={send} disabled={sending || uploading > 0}>
							{sending ? <Spinner /> : <Send className="h-4 w-4" />}
							Send
						</Button>
						<input ref={fileRef} type="file" multiple className="hidden" data-testid="compose-file" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
						<button type="button" aria-label="Attach files" title="Attach files" onClick={() => fileRef.current?.click()} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
							<Paperclip className="h-4 w-4" />
						</button>
						<span className="hidden flex-1 text-xs text-muted-foreground sm:block">Ctrl+Enter to send</span>
						<button type="button" aria-label="Discard draft" title="Discard draft" data-testid="compose-discard" onClick={discard} className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-destructive">
							<Trash2 className="h-4 w-4" />
						</button>
					</div>
				</>
			)}
		</div>
	);
}

function Chip({ name, size, onRemove }: { name: string; size: number; onRemove: () => void }) {
	return (
		<span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-white/[0.06] py-1 pr-1 pl-2 text-xs">
			<Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
			<span className="truncate">{name}</span>
			<span className="text-muted-foreground">{fmtSize(size)}</span>
			<button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
				<X className="h-3 w-3" />
			</button>
		</span>
	);
}
