import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Copy,
	Inbox,
	Layers,
	Mail,
	MessagesSquare,
	Newspaper,
	ShieldCheck,
	Sparkles,
	Tag,
	Wand2,
	Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Faq } from "@/features/marketing/components/faq";
import { PricingGrid } from "@/features/marketing/components/pricing-grid";
import { SiteFooter, SiteNav } from "@/features/marketing/components/site-chrome";
import { Reveal } from "@/features/marketing/components/reveal";

export const Route = createFileRoute("/")({
	component: LandingPage,
});

function LandingPage() {
	return (
		<div className="dark min-h-svh bg-background text-foreground antialiased">
			<SiteNav />
			<Hero />
			<Marquee />
			<Problem />
			<Features />
			<Principles />
			<PricingSection />
			<section className="mx-auto max-w-3xl px-6 pb-28">
				<Faq />
			</section>
			<FinalCta />
			<SiteFooter />
		</div>
	);
}

// ─── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
	return (
		<section className="auth-atmosphere grain relative overflow-hidden">
			<div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-32">
				<div>
					<div className="mb-6 inline-flex animate-fade-in items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
						<Sparkles className="h-3.5 w-3.5 text-primary" />
						AI-native email · Gmail first
					</div>

					<h1 className="text-balance font-display text-6xl leading-[0.95] tracking-tight sm:text-7xl">
						The inbox that{" "}
						<span className="italic text-primary">reads</span> for you.
					</h1>

					<p className="mt-7 max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
						Email hasn't changed since 1982. Postscript sits on top of your
						Gmail and does the reading, threading, and drafting, then hands you
						the <span className="text-foreground">action</span>, not the raw
						message.
					</p>

					<div className="mt-9 flex flex-wrap items-center gap-3">
						<Button asChild size="lg" className="text-base">
							<Link to="/register">
								Start free
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
						<Button asChild size="lg" variant="outline" className="border-white/15 bg-white/[0.03] text-base hover:bg-white/[0.06]">
							<Link to="/login">Sign in</Link>
						</Button>
					</div>

					<p className="mt-5 text-sm text-muted-foreground/70">
						Free tier: one mailbox, all the AI. No credit card.
					</p>
				</div>

				<div className="animate-float lg:justify-self-end">
					<HeroDemo />
				</div>
			</div>
		</section>
	);
}

/** Before → after: a noisy raw email collapsing into a single action. */
function HeroDemo() {
	return (
		<div className="relative w-full max-w-sm">
			{/* Raw email (behind, faded) */}
			<div className="absolute -left-6 -top-8 hidden w-64 rotate-[-6deg] rounded-xl border border-white/10 bg-white/[0.03] p-4 opacity-60 blur-[0.5px] sm:block">
				<div className="mb-2 h-2 w-24 rounded bg-white/15" />
				<div className="space-y-1.5">
					<div className="h-1.5 w-full rounded bg-white/8" />
					<div className="h-1.5 w-5/6 rounded bg-white/8" />
					<div className="h-1.5 w-4/6 rounded bg-white/8" />
					<div className="mt-3 h-8 w-full rounded bg-white/5" />
					<div className="h-1.5 w-3/6 rounded bg-white/8" />
				</div>
			</div>

			{/* Extracted action card (front) */}
			<div className="relative rounded-2xl border border-white/10 bg-card/80 p-5 shadow-2xl backdrop-blur-xl">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15">
							<ShieldCheck className="h-4 w-4 text-primary" />
						</div>
						<span className="text-sm text-muted-foreground">GitHub</span>
					</div>
					<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
						extracted
					</span>
				</div>

				<p className="mt-4 text-xs text-muted-foreground">
					Your verification code
				</p>
				<div className="mt-2 flex items-center justify-between gap-3">
					<span className="font-mono text-4xl tracking-[0.25em] text-foreground">
						28419
					</span>
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
						tabIndex={-1}
						aria-hidden
					>
						<Copy className="h-4 w-4" />
						Copy
					</button>
				</div>

				<div className="mt-5 border-t border-white/5 pt-4">
					<p className="text-xs leading-relaxed text-muted-foreground">
						<span className="text-primary">Postscript</span> read the email so
						you don't have to. No opening, no scrolling.
					</p>
				</div>
			</div>
		</div>
	);
}

// ─── Marquee ──────────────────────────────────────────────────────────────────
const KILLED = [
	"ad chrome",
	"template junk",
	"OTP hunting",
	"promo noise",
	"20-email threads",
	"blank compose boxes",
	"buried actions",
	"context whiplash",
];

function Marquee() {
	const items = [...KILLED, ...KILLED];
	return (
		<section className="border-y border-white/5 py-6">
			<div className="relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
				<div className="flex shrink-0 animate-marquee items-center gap-4 pr-4">
					{items.map((word, i) => (
						<span
							key={`${word}-${i}`}
							className="flex items-center gap-4 whitespace-nowrap text-lg text-muted-foreground/60"
						>
							<span className="font-display italic">no more</span>
							<span className="text-foreground">{word}</span>
							<span className="text-primary">✳</span>
						</span>
					))}
				</div>
			</div>
		</section>
	);
}

// ─── Problem ──────────────────────────────────────────────────────────────────
function Problem() {
	return (
		<section id="problem" className="mx-auto max-w-6xl px-6 py-28">
			<Reveal className="max-w-3xl">
				<p className="mb-4 text-sm font-medium uppercase tracking-widest text-primary">
					The problem
				</p>
				<h2 className="text-balance font-display text-4xl leading-tight tracking-tight sm:text-5xl">
					The protocol can't move. The{" "}
					<span className="text-primary">client</span> is wide open.
				</h2>
				<p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground">
					SMTP needs every provider on Earth to agree, a coordination
					deadlock. So we keep the dumb transport exactly as-is and put all the
					intelligence in the interface. Superhuman proved people pay for a
					better layer. We go further: the layer{" "}
					<span className="text-foreground">understands</span> the mail.
				</p>
			</Reveal>
		</section>
	);
}

// ─── Features (bento) ─────────────────────────────────────────────────────────
function Features() {
	return (
		<section id="features" className="mx-auto max-w-6xl px-6 pb-28">
			<Reveal className="mb-14 max-w-2xl">
				<p className="mb-4 text-sm font-medium uppercase tracking-widest text-primary">
					What it does
				</p>
				<h2 className="text-balance font-display text-4xl leading-tight tracking-tight sm:text-5xl">
					It extracts intent. You get the action.
				</h2>
			</Reveal>

			<div className="grid auto-rows-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<BentoCard
					className="lg:col-span-2"
					icon={<Zap className="h-5 w-5" />}
					title="Action extraction"
					body="OTP codes, magic links, one-tap confirms, scraped out of the markup and handed to you as a button. Suspicious links flagged before you open them."
					delay={0}
				>
					<ActionMock />
				</BentoCard>

				<BentoCard
					icon={<Tag className="h-5 w-5" />}
					title="Journals"
					body="Work, School, Family, Job-hunting, the AI sorts by content and behaviour, not rigid rules."
					delay={60}
				>
					<JournalMock />
				</BentoCard>

				<BentoCard
					icon={<MessagesSquare className="h-5 w-5" />}
					title="Thread collapse"
					body="A 20-email decision thread becomes a running group chat. The AI holds the state and offers your next move."
					delay={0}
					className="lg:col-span-2"
				>
					<ThreadMock />
				</BentoCard>

				<BentoCard
					icon={<Newspaper className="h-5 w-5" />}
					title="Readable digest"
					body="Newsletters stripped of ad chrome, just the signal, clean enough to read or (soon) listen to."
					delay={60}
				/>
				<BentoCard
					icon={<Layers className="h-5 w-5" />}
					title="Promo collapse"
					body="Hundreds of promos, collected quietly. Nothing interrupts unless it's genuinely for you."
					delay={120}
				/>
				<BentoCard
					icon={<Wand2 className="h-5 w-5" />}
					title="AI reply"
					body="Pre-drafted in your voice, so you're editing, never staring at a blank box."
					delay={180}
				/>
			</div>
		</section>
	);
}

function BentoCard({
	icon,
	title,
	body,
	children,
	className,
	delay = 0,
}: {
	icon: React.ReactNode;
	title: string;
	body: string;
	children?: React.ReactNode;
	className?: string;
	delay?: number;
}) {
	return (
		<Reveal
			delay={delay}
			className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-6 transition-colors hover:border-primary/30 hover:bg-white/[0.035] ${className ?? ""}`}
		>
			<div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
				{icon}
			</div>
			<h3 className="font-display text-2xl tracking-tight">{title}</h3>
			<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
				{body}
			</p>
			{children && <div className="mt-5">{children}</div>}
		</Reveal>
	);
}

function ActionMock() {
	return (
		<div className="rounded-xl border border-white/10 bg-background/60 p-4">
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">Reset link · Figma</span>
				<span className="text-[10px] uppercase tracking-wider text-primary">
					1 action
				</span>
			</div>
			<div className="mt-3 flex items-center gap-2">
				<button
					type="button"
					tabIndex={-1}
					aria-hidden
					className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
				>
					Reset password
				</button>
				<button
					type="button"
					tabIndex={-1}
					aria-hidden
					className="rounded-lg border border-white/10 px-3 py-2 text-sm text-muted-foreground"
				>
					Ignore
				</button>
			</div>
		</div>
	);
}

function JournalMock() {
	const tabs = ["Work", "Family", "Job hunt"];
	return (
		<div className="flex flex-wrap gap-2">
			{tabs.map((t, i) => (
				<span
					key={t}
					className={`rounded-full border px-3 py-1 text-xs ${
						i === 0
							? "border-primary/40 bg-primary/10 text-primary"
							: "border-white/10 text-muted-foreground"
					}`}
				>
					{t}
				</span>
			))}
		</div>
	);
}

function ThreadMock() {
	return (
		<div className="space-y-2 rounded-xl border border-white/10 bg-background/60 p-4">
			<Bubble who="HR" text="Leaning toward candidate Y." />
			<Bubble who="Lead" accent text="Y works for me. Ship it?" />
			<div className="flex flex-wrap gap-2 pt-1">
				{["Agree with Y", "Propose Z", "Ask more"].map((o, i) => (
					<span
						key={o}
						className={`rounded-md px-2.5 py-1 text-xs ${
							i === 0
								? "bg-primary text-primary-foreground"
								: "border border-white/10 text-muted-foreground"
						}`}
					>
						{o}
					</span>
				))}
			</div>
		</div>
	);
}

function Bubble({
	who,
	text,
	accent,
}: {
	who: string;
	text: string;
	accent?: boolean;
}) {
	return (
		<div className="flex items-start gap-2 text-xs">
			<span
				className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 ${
					accent ? "bg-primary/15 text-primary" : "bg-white/10 text-muted-foreground"
				}`}
			>
				{who}
			</span>
			<span className="text-foreground/90">{text}</span>
		</div>
	);
}

// ─── Principles ───────────────────────────────────────────────────────────────
const PRINCIPLES = [
	{
		icon: <Zap className="h-5 w-5" />,
		title: "Extract the intent",
		body: "Surface the code, the button, the decision, not the raw email.",
	},
	{
		icon: <Inbox className="h-5 w-5" />,
		title: "Context over folders",
		body: "Journals emerge from behaviour and content, not rigid user rules.",
	},
	{
		icon: <Mail className="h-5 w-5" />,
		title: "Provider-agnostic",
		body: "Gmail plus any IMAP mailbox: Outlook, Zoho, Yahoo, iCloud and more.",
	},
	{
		icon: <ShieldCheck className="h-5 w-5" />,
		title: "Private by design",
		body: "We never store your email bodies. What we keep is encrypted.",
	},
];

function Principles() {
	return (
		<section id="principles" className="border-y border-white/5 bg-white/[0.015]">
			<div className="mx-auto max-w-6xl px-6 py-24">
				<Reveal className="mb-14 max-w-2xl">
					<p className="mb-4 text-sm font-medium uppercase tracking-widest text-primary">
						How we build
					</p>
					<h2 className="font-display text-4xl tracking-tight sm:text-5xl">
						The intelligence lives in the interface.
					</h2>
				</Reveal>
				<div className="grid gap-x-8 gap-y-12 sm:grid-cols-2">
					{PRINCIPLES.map((p, i) => (
						<Reveal
							key={p.title}
							delay={i * 70}
							className="flex gap-4"
						>
							<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
								{p.icon}
							</div>
							<div>
								<h3 className="font-display text-xl tracking-tight">
									{p.title}
								</h3>
								<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
									{p.body}
								</p>
							</div>
						</Reveal>
					))}
				</div>
			</div>
		</section>
	);
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCta() {
	return (
		<section className="relative overflow-hidden px-6 py-32">
			<div className="auth-atmosphere grain absolute inset-0 opacity-90" />
			<Reveal className="relative mx-auto max-w-3xl text-center">
				<h2 className="text-balance font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">
					Stop parsing email.
					<br />
					Start acting on it.
				</h2>
				<p className="mx-auto mt-6 max-w-lg text-lg text-muted-foreground">
					Connect Gmail or any IMAP mailbox in a minute. Watch the noise collapse into a
					handful of things that actually need you.
				</p>
				<div className="mt-10 flex flex-wrap justify-center gap-3">
					<Button asChild size="lg" className="text-base">
						<Link to="/register">
							Start free
							<ArrowRight className="h-4 w-4" />
						</Link>
					</Button>
					<Button
						asChild
						size="lg"
						variant="outline"
						className="border-white/15 bg-white/[0.03] text-base hover:bg-white/[0.06]"
					>
						<Link to="/login">Sign in</Link>
					</Button>
				</div>
			</Reveal>
		</section>
	);
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function PricingSection() {
	return (
		<section id="pricing" className="mx-auto max-w-6xl px-6 py-28">
			<Reveal className="mx-auto mb-12 max-w-2xl text-center">
				<p className="mb-4 text-sm font-medium uppercase tracking-widest text-primary">Pricing</p>
				<h2 className="font-display text-4xl tracking-tight sm:text-5xl">Free to start. Fair when you grow.</h2>
			</Reveal>
			<PricingGrid />
		</section>
	);
}
