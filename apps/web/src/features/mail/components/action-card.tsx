import {
	ArrowUpRight,
	Check,
	Copy,
	CreditCard,
	Download,
	KeyRound,
	MailCheck,
	RotateCcw,
	ShieldAlert,
	ShieldCheck,
} from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import type { ExtractedAction, MessageActions } from "@postscript/types";

const VERB_ICON: Record<ExtractedAction["verb"], React.ReactNode> = {
	open: <ArrowUpRight className="h-4 w-4" />,
	verify: <MailCheck className="h-4 w-4" />,
	reset: <RotateCcw className="h-4 w-4" />,
	confirm: <Check className="h-4 w-4" />,
	pay: <CreditCard className="h-4 w-4" />,
	view: <ArrowUpRight className="h-4 w-4" />,
	track: <ArrowUpRight className="h-4 w-4" />,
	download: <Download className="h-4 w-4" />,
	unsubscribe: <ArrowUpRight className="h-4 w-4" />,
};

/** The ⭐ action card: OTP copy + one-tap action buttons for a message. */
export function ActionCard({ item }: { item: MessageActions }) {
	const { otp, actions, summary } = item.result;
	return (
		<div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-5">
			<div className="mb-3 flex items-center gap-2">
				<ShieldCheck className="h-4 w-4 text-primary" />
				<span className="text-xs font-medium uppercase tracking-wider text-primary">
					Extracted for you
				</span>
			</div>

			{summary && (
				<p className="mb-4 text-sm text-muted-foreground">{summary}</p>
			)}

			{otp && <OtpBlock code={otp} />}

			{actions.length > 0 && (
				<div className={cn("flex flex-wrap gap-2", otp && "mt-4")}>
					{actions.map((a, i) => (
						<ActionButton key={`${a.url}-${i}`} action={a} />
					))}
				</div>
			)}
		</div>
	);
}

function OtpBlock({ code }: { code: string }) {
	const { isCopied, handleCopy } = useCopyToClipboard({
		text: code,
		copyMessage: "Code copied",
	});
	return (
		<div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-background/60 px-4 py-3">
			<div>
				<div className="text-xs text-muted-foreground">Verification code</div>
				<div className="mt-0.5 font-mono text-3xl tracking-[0.25em] text-foreground">
					{code}
				</div>
			</div>
			<button
				type="button"
				onClick={handleCopy}
				className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
			>
				{isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
				{isCopied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}

function ActionButton({ action }: { action: ExtractedAction }) {
	if (action.suspicious) {
		return (
			<button
				type="button"
				onClick={() => {
					if (
						confirm(
							`This link looks suspicious:\n${action.url}\n\nOpen it anyway?`,
						)
					) {
						window.open(action.url, "_blank", "noopener,noreferrer");
					}
				}}
				className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15"
			>
				<ShieldAlert className="h-4 w-4" />
				{action.label}
				<span className="text-xs opacity-70">· check first</span>
			</button>
		);
	}
	return (
		<a
			href={action.url}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
		>
			{VERB_ICON[action.verb] ?? <KeyRound className="h-4 w-4" />}
			{action.label}
		</a>
	);
}
