import { PLANS, type PlanId, PREPAID_PERIODS, type PrepaidPeriodMonths } from "@postscript/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { paymentsApi } from "../payments-api";

type Method = "chapa" | "telebirr" | "manual";

export function PayInBirrDialog({ plan, trigger }: { plan: Exclude<PlanId, "free">; trigger: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	const [periodMonths, setPeriodMonths] = useState<PrepaidPeriodMonths>(1);
	const [method, setMethod] = useState<Method | null>(null);
	const options = useQuery({ queryKey: ["payment-options"], queryFn: paymentsApi.options, enabled: open });

	const amountEtb = options.data ? Math.round(PLANS[plan].priceMonthly * periodMonths * options.data.usdToEtb) : null;

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) setMethod(null);
			}}
		>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent data-testid={`pay-in-birr-dialog-${plan}`} className="max-w-md">
				<DialogHeader>
					<DialogTitle>Pay in Birr for {PLANS[plan].name}</DialogTitle>
					<DialogDescription>Choose how long to pay for and how to pay.</DialogDescription>
				</DialogHeader>
				{options.isLoading ? (
					<Spinner className="h-5 w-5" />
				) : options.error ? (
					<p className="text-sm text-destructive">{getApiError(options.error).message}</p>
				) : options.data ? (
					<div className="flex flex-col gap-4">
						<div>
							<p className="mb-1.5 text-xs text-muted-foreground">How many months</p>
							<div className="flex gap-1.5">
								{PREPAID_PERIODS.map((m) => (
									<button
										key={m}
										type="button"
										data-testid={`period-${m}`}
										onClick={() => setPeriodMonths(m)}
										className={cn("rounded-lg px-3 py-1.5 text-sm", periodMonths === m ? "bg-white/[0.1]" : "bg-white/[0.04] text-muted-foreground")}
									>
										{m} {m === 1 ? "month" : "months"}
									</button>
								))}
							</div>
							{amountEtb != null && <p className="mt-2 text-sm text-muted-foreground">Total: {amountEtb.toLocaleString("en-US")} Birr</p>}
						</div>

						<div className="flex flex-col gap-2">
							{options.data.methods.chapa && (
								<MethodButton testId="method-chapa" label="Pay with card or mobile money (Chapa)" active={method === "chapa"} onClick={() => setMethod("chapa")} />
							)}
							{options.data.methods.telebirr && (
								<MethodButton testId="method-telebirr" label="Pay with Telebirr" active={method === "telebirr"} onClick={() => setMethod("telebirr")} />
							)}
							{options.data.methods.manual && (
								<MethodButton testId="method-manual" label="Upload proof of payment" active={method === "manual"} onClick={() => setMethod("manual")} />
							)}
							{!options.data.methods.chapa && !options.data.methods.telebirr && !options.data.methods.manual && (
								<p className="text-sm text-muted-foreground">No way to pay in Birr is set up yet. Please contact us.</p>
							)}
						</div>

						{method === "chapa" && <ChapaPanel plan={plan} periodMonths={periodMonths} />}
						{method === "telebirr" && <TelebirrPanel plan={plan} periodMonths={periodMonths} instructions={options.data.telebirr.instructions} merchantNumber={options.data.telebirr.merchantNumber} onDone={() => setOpen(false)} />}
						{method === "manual" && <ManualPanel plan={plan} periodMonths={periodMonths} onDone={() => setOpen(false)} />}
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function MethodButton({ testId, label, active, onClick }: { testId: string; label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			data-testid={testId}
			onClick={onClick}
			className={cn("rounded-lg border px-3 py-2 text-left text-sm", active ? "border-primary/50 bg-primary/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]")}
		>
			{label}
		</button>
	);
}

function ChapaPanel({ plan, periodMonths }: { plan: Exclude<PlanId, "free">; periodMonths: PrepaidPeriodMonths }) {
	const init = useMutation({
		mutationFn: () => paymentsApi.chapaInit(plan, periodMonths),
		onSuccess: (r) => {
			window.location.href = r.checkoutUrl;
		},
		onError: (err) => toast.error(getApiError(err).message),
	});
	return (
		<Button data-testid="chapa-pay-button" disabled={init.isPending} onClick={() => init.mutate()} className="w-full">
			{init.isPending ? "Starting checkout..." : "Continue to Chapa"}
		</Button>
	);
}

function TelebirrPanel({
	plan,
	periodMonths,
	instructions,
	merchantNumber,
	onDone,
}: {
	plan: Exclude<PlanId, "free">;
	periodMonths: PrepaidPeriodMonths;
	instructions: string;
	merchantNumber: string | null;
	onDone: () => void;
}) {
	const [txnId, setTxnId] = useState("");
	const submit = useMutation({
		mutationFn: () => paymentsApi.telebirrSubmit(plan, periodMonths, txnId),
		onSuccess: (r) => {
			if (r.ok) {
				toast.success(r.message);
				onDone();
			} else {
				toast.error(r.message);
			}
		},
		onError: (err) => toast.error(getApiError(err).message),
	});
	return (
		<div className="flex flex-col gap-2 rounded-lg bg-white/[0.03] p-3">
			{merchantNumber && <p className="text-sm font-medium">Telebirr number: {merchantNumber}</p>}
			<p className="text-xs text-muted-foreground">{instructions}</p>
			<Input data-testid="telebirr-txn-id" placeholder="Transaction id from your receipt" value={txnId} onChange={(e) => setTxnId(e.target.value)} className="h-9" />
			<Button data-testid="telebirr-submit" disabled={!txnId || submit.isPending} onClick={() => submit.mutate()}>
				{submit.isPending ? "Checking..." : "Check receipt and activate"}
			</Button>
		</div>
	);
}

function ManualPanel({ plan, periodMonths, onDone }: { plan: Exclude<PlanId, "free">; periodMonths: PrepaidPeriodMonths; onDone: () => void }) {
	const [file, setFile] = useState<File | null>(null);
	const [note, setNote] = useState("");
	const submit = useMutation({
		mutationFn: () => {
			if (!file) throw new Error("Attach a file first.");
			return paymentsApi.manualSubmit(plan, periodMonths, file, note || undefined);
		},
		onSuccess: () => {
			toast.success("Sent. We will check it and activate your plan soon.");
			onDone();
		},
		onError: (err) => toast.error(getApiError(err).message),
	});
	return (
		<div className="flex flex-col gap-2 rounded-lg bg-white/[0.03] p-3">
			<p className="text-xs text-muted-foreground">Pay by any way you like, then upload a screenshot or reference here. We check it by hand and turn your plan on.</p>
			<input
				data-testid="manual-file"
				type="file"
				accept="image/png,image/jpeg,image/webp,application/pdf"
				onChange={(e) => setFile(e.target.files?.[0] ?? null)}
				className="text-xs"
			/>
			<Input data-testid="manual-note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="h-9" />
			<Button data-testid="manual-submit" disabled={!file || submit.isPending} onClick={() => submit.mutate()}>
				{submit.isPending ? "Sending..." : "Send for review"}
			</Button>
		</div>
	);
}
