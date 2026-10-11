import { type BillingInterval, type MeResponse, PLANS, type PlanId } from "@postscript/types";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Section } from "@/features/settings/section";
import { getApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { billingApi } from "../api";
import { UsageMeter } from "./usage-meter";

const SOURCE = { free: "Free plan", subscription: "Paid subscription", comp: "Granted by Postscript" } as const;

export function BillingTab({ me }: { me: MeResponse }) {
	const billing = useQuery({ queryKey: ["billing"], queryFn: billingApi.summary });
	const [interval, setBillingInterval] = useState<BillingInterval>("month");
	const [seats, setSeats] = useState(Math.max(2, me.usage.seatsUsed));
	const [busy, setBusy] = useState<string | null>(null);

	const go = async (key: string, fn: () => Promise<string>) => {
		setBusy(key);
		try {
			window.location.href = await fn();
		} catch (err) {
			toast.error(getApiError(err).message);
			setBusy(null);
		}
	};

	const b = billing.data;
	const current = b?.plan ?? me.activeOrg.plan;

	return (
		<div className="divide-y divide-white/[0.06]">
			<Section title="Usage" description="What this workspace has used this month.">
				<UsageMeter usage={me.usage} />
			</Section>

			<Section title="Plan" description={b ? SOURCE[b.source] : undefined} testId="billing-section">
				{billing.isLoading ? (
					<Spinner className="h-5 w-5" />
				) : billing.isError || !b ? (
					<p className="text-sm text-muted-foreground">{getApiError(billing.error).message}</p>
				) : (
					<div className="space-y-5">
						<div>
							<p className="text-lg font-medium" data-testid="current-plan">{PLANS[current].name}</p>
							{b.subscription && (
								<p className="mt-1 text-sm text-muted-foreground">
									{b.subscription.seats > 1 ? `${b.subscription.seats} seats, ` : ""}
									{b.subscription.interval === "year" ? "billed yearly" : "billed monthly"}
									{b.subscription.currentPeriodEnd &&
										`, ${b.subscription.cancelAtPeriodEnd ? "ends" : "renews"} ${new Date(b.subscription.currentPeriodEnd).toLocaleDateString()}`}
									{b.subscription.status !== "active" && ` (${b.subscription.status})`}
								</p>
							)}
						</div>

						{!b.configured ? (
							<p className="rounded-lg bg-white/[0.04] p-3 text-sm text-muted-foreground" data-testid="billing-not-configured">
								Billing not configured yet. Everyone is on the Free plan for now.
							</p>
						) : !b.canManage ? (
							<p className="text-sm text-muted-foreground">Only the workspace owner can change the plan.</p>
						) : (
							<>
								{b.subscription && (
									<Button variant="outline" disabled={busy === "portal"} onClick={() => go("portal", billingApi.portal)} data-testid="manage-billing">
										{busy === "portal" && <Spinner />}
										Manage billing
									</Button>
								)}
								<div className="inline-flex rounded-lg bg-white/[0.04] p-0.5 text-sm">
									{(["month", "year"] as const).map((i) => (
										<button key={i} type="button" onClick={() => setBillingInterval(i)} className={cn("rounded-md px-3 py-1.5", interval === i ? "bg-white/[0.08]" : "text-muted-foreground")}>
											{i === "month" ? "Monthly" : "Yearly"}
										</button>
									))}
								</div>
								<div className="grid gap-3 sm:grid-cols-2">
									{(["pro", "team"] as PlanId[]).map((id) => {
										const p = PLANS[id];
										const available = (b.availableIntervals[id as "pro" | "team"] ?? []).includes(interval);
										const isCurrent = current === id;
										return (
											<div key={id} className={cn("rounded-xl bg-white/[0.03] p-4", isCurrent && "ring-1 ring-primary/40")}>
												<div className="flex items-baseline justify-between">
													<span className="font-medium">{p.name}</span>
													<span className="text-sm">
														${interval === "month" ? p.priceMonthly : p.priceYearly}
														<span className="text-muted-foreground">{p.perSeat ? "/seat" : ""}/{interval === "month" ? "mo" : "yr"}</span>
													</span>
												</div>
												<ul className="mt-3 space-y-1">
													{p.features.map((f) => (
														<li key={f} className="flex gap-2 text-xs text-muted-foreground">
															<Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
															{f}
														</li>
													))}
												</ul>
												{id === "team" && (
													<label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
														Seats
														<Input type="number" min={1} max={500} value={seats} onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-20" />
													</label>
												)}
												<Button
													className="mt-4 w-full"
													size="sm"
													data-testid={`upgrade-${id}`}
													disabled={isCurrent || !available || busy !== null}
													onClick={() => go(id, () => billingApi.checkout({ plan: id as "pro" | "team", interval, seats: id === "team" ? seats : undefined }))}
												>
													{busy === id && <Spinner />}
													{isCurrent ? "Current plan" : !available ? "Not available" : `Upgrade to ${p.name}`}
												</Button>
											</div>
										);
									})}
								</div>
							</>
						)}
					</div>
				)}
			</Section>
		</div>
	);
}
