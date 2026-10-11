import { type BillingInterval, PLAN_IDS, PLANS } from "@postscript/types";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The three plans from the shared PLANS config, with a monthly/yearly toggle. */
export function PricingGrid() {
	const [interval, setBillingInterval] = useState<BillingInterval>("month");
	return (
		<div>
			<div className="flex justify-center">
				<div className="inline-flex rounded-lg bg-white/[0.05] p-1 text-sm" role="tablist">
					{(["month", "year"] as const).map((i) => (
						<button
							key={i}
							type="button"
							role="tab"
							aria-selected={interval === i}
							data-testid={`interval-${i}`}
							onClick={() => setBillingInterval(i)}
							className={cn("rounded-md px-4 py-1.5 transition-colors", interval === i ? "bg-white/[0.1] text-foreground" : "text-muted-foreground")}
						>
							{i === "month" ? "Monthly" : "Yearly (2 months free)"}
						</button>
					))}
				</div>
			</div>
			<div className="mt-10 grid gap-4 md:grid-cols-3">
				{PLAN_IDS.map((id) => {
					const p = PLANS[id];
					const price = interval === "month" ? p.priceMonthly : p.priceYearly;
					const featured = id === "pro";
					return (
						<div
							key={id}
							data-testid={`plan-${id}`}
							className={cn("flex flex-col rounded-2xl p-6", featured ? "bg-primary/[0.08] ring-1 ring-primary/30" : "bg-white/[0.03]")}
						>
							<div className="flex items-baseline justify-between">
								<h3 className="font-display text-2xl tracking-tight">{p.name}</h3>
								{featured && <span className="text-xs font-medium text-primary">Most popular</span>}
							</div>
							<p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
							<p className="mt-6">
								<span className="text-4xl font-semibold tracking-tight">${price}</span>
								<span className="text-sm text-muted-foreground">
									{price === 0 ? " forever" : `${p.perSeat ? " per seat" : ""} / ${interval === "month" ? "month" : "year"}`}
								</span>
							</p>
							<ul className="mt-6 flex-1 space-y-2.5">
								{p.features.map((f) => (
									<li key={f} className="flex gap-2.5 text-sm">
										<Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
										<span className="text-foreground/85">{f}</span>
									</li>
								))}
							</ul>
							<Button asChild className="mt-8 w-full" variant={featured ? "default" : "outline"}>
								<Link to="/register">{id === "free" ? "Start free" : `Start with ${p.name}`}</Link>
							</Button>
						</div>
					);
				})}
			</div>
			<p className="mt-6 text-center text-xs text-muted-foreground">Prices in US dollars. Upgrade or cancel any time from Settings.</p>
		</div>
	);
}
