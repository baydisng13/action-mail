import { Copy, Sparkles } from "lucide-react";
import { Wordmark } from "./wordmark";

/**
 * Full-screen split layout for every auth page. Left: an atmospheric brand
 * panel that sells the product. Right: the focused form. The whole surface
 * runs in dark mode for a single, premium, cohesive feel.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="dark grid min-h-svh bg-background text-foreground lg:grid-cols-[1.05fr_1fr]">
			<BrandPanel />
			<main className="relative flex flex-col px-6 py-10 sm:px-10">
				{/* Mobile wordmark (brand panel is hidden below lg). */}
				<div className="mb-10 lg:hidden">
					<Wordmark />
				</div>
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-sm animate-rise">{children}</div>
				</div>
			</main>
		</div>
	);
}

function BrandPanel() {
	return (
		<aside className="auth-atmosphere grain relative hidden overflow-hidden border-r border-white/5 lg:flex lg:flex-col lg:justify-between lg:p-12">
			<Wordmark />

			<div className="relative max-w-md">
				<div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
					<Sparkles className="h-3.5 w-3.5 text-primary" />
					AI-native email
				</div>
				<h1 className="font-display text-5xl leading-[1.05] tracking-tight text-foreground">
					The inbox that
					<br />
					reads for you.
				</h1>
				<p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground">
					Postscript does the reading, threading, and drafting — and hands you
					the action, not the raw message. The signal, none of the noise.
				</p>

				<ActionCardTeaser />
			</div>

			<p className="relative text-xs text-muted-foreground/70">
				© {2026} Postscript. Private by design.
			</p>
		</aside>
	);
}

/** A small mock of the product's action-extraction card. Pure decoration. */
function ActionCardTeaser() {
	return (
		<div className="mt-10 w-full max-w-xs rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">
					Verification code · GitHub
				</span>
				<span className="text-[10px] uppercase tracking-wider text-primary">
					extracted
				</span>
			</div>
			<div className="mt-3 flex items-center justify-between gap-3">
				<span className="font-mono text-3xl tracking-[0.3em] text-foreground">
					28419
				</span>
				<button
					type="button"
					className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
					tabIndex={-1}
					aria-hidden
				>
					<Copy className="h-3.5 w-3.5" />
					Copy
				</button>
			</div>
		</div>
	);
}
