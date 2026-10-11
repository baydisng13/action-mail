import { createFileRoute } from "@tanstack/react-router";
import { Faq } from "@/features/marketing/components/faq";
import { PricingGrid } from "@/features/marketing/components/pricing-grid";
import { SiteFooter, SiteNav } from "@/features/marketing/components/site-chrome";

export const Route = createFileRoute("/pricing")({
	head: () => ({ meta: [{ title: "Pricing | Postscript" }] }),
	component: PricingPage,
});

function PricingPage() {
	return (
		<div className="dark min-h-svh bg-background text-foreground antialiased">
			<SiteNav />
			<main className="mx-auto max-w-6xl px-6 py-20">
				<div className="mx-auto max-w-2xl text-center">
					<h1 className="font-display text-5xl tracking-tight" data-testid="pricing-title">Simple pricing</h1>
					<p className="mt-4 text-lg text-muted-foreground">Start free with one inbox. Pay when you want more mailboxes, more AI, or your team.</p>
				</div>
				<div className="mt-14">
					<PricingGrid />
				</div>
				<div className="mx-auto mt-24 max-w-3xl">
					<Faq />
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}
