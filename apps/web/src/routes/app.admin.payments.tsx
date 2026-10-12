import type { PaymentRow } from "@postscript/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { adminPaymentsApi } from "@/features/billing/payments-api";
import { useMe } from "@/features/auth/hooks";
import { apiClient, getApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

async function openProof(id: string) {
	try {
		const res = await apiClient.get(`/api/admin/payments/${id}/proof`, { responseType: "blob" });
		const url = URL.createObjectURL(res.data as Blob);
		window.open(url, "_blank");
	} catch (err) {
		toast.error(getApiError(err).message);
	}
}

export const Route = createFileRoute("/app/admin/payments")({
	component: AdminPaymentsPage,
});

function AdminPaymentsPage() {
	const me = useMe();
	const [status, setStatus] = useState<string | undefined>(undefined);
	const isAdmin = Boolean(me.data?.user.isPlatformAdmin);
	const q = useQuery({ queryKey: ["admin", "payments", status], queryFn: () => adminPaymentsApi.list(status), enabled: isAdmin });

	if (me.data && !isAdmin) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
				<p className="font-medium">This page is for Postscript staff.</p>
				<Link to="/app" className="text-sm underline">Back to mail</Link>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto" data-testid="admin-payments">
			<div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Link to="/app/admin" className="hover:text-foreground">Admin</Link>
					<span>/</span>
					<span>Payments</span>
				</div>
				<h1 className="mt-1 font-display text-3xl tracking-tight">Payments</h1>
				<div className="mt-4 flex flex-wrap gap-1.5">
					{([undefined, "pending", "paid", "failed", "rejected"] as const).map((s) => (
						<button
							key={s ?? "all"}
							type="button"
							data-testid={`payments-filter-${s ?? "all"}`}
							onClick={() => setStatus(s)}
							className={cn("rounded-lg px-3 py-1.5 text-sm", status === s ? "bg-white/[0.08]" : "text-muted-foreground hover:bg-white/[0.05]")}
						>
							{s ?? "All"}
						</button>
					))}
				</div>
				{q.isLoading && <Spinner className="mt-6 h-5 w-5" />}
				{q.error && <p className="mt-6 text-sm text-destructive">{getApiError(q.error).message}</p>}
				{q.data && <PaymentsTable rows={q.data} />}
			</div>
		</div>
	);
}

function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
	const qc = useQueryClient();
	const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "payments"] });
	const decide = useMutation({
		mutationFn: (v: { id: string; approve: boolean }) => (v.approve ? adminPaymentsApi.approve(v.id) : adminPaymentsApi.reject(v.id)),
		onSuccess: () => {
			toast.success("Payment updated");
			refresh();
		},
		onError: (err) => toast.error(getApiError(err).message),
	});

	if (rows.length === 0) return <p className="mt-6 text-sm text-muted-foreground">No payments here.</p>;

	return (
		<div className="mt-4 overflow-x-auto">
			<table className="w-full min-w-[800px] text-sm" data-testid="payments-table">
				<thead className="text-left text-xs text-muted-foreground">
					<tr>
						<th className="py-2 pr-3 font-normal">Workspace</th>
						<th className="py-2 pr-3 font-normal">User</th>
						<th className="py-2 pr-3 font-normal">Method</th>
						<th className="py-2 pr-3 font-normal">Plan</th>
						<th className="py-2 pr-3 font-normal">Amount</th>
						<th className="py-2 pr-3 font-normal">Status</th>
						<th className="py-2 pr-3 font-normal">Date</th>
						<th className="py-2 font-normal" />
					</tr>
				</thead>
				<tbody className="divide-y divide-white/[0.05]">
					{rows.map((p) => (
						<tr key={p.id} data-testid="payment-row">
							<td className="py-2.5 pr-3">{p.organizationName}</td>
							<td className="py-2.5 pr-3 text-muted-foreground">{p.userEmail ?? "-"}</td>
							<td className="py-2.5 pr-3 capitalize">{p.method}</td>
							<td className="py-2.5 pr-3 capitalize">
								{p.plan} · {p.periodMonths}mo{p.plan === "team" ? ` · ${p.seats} seats` : ""}
							</td>
							<td className="py-2.5 pr-3 tabular-nums">
								{(p.amountMinor / 100).toLocaleString("en-US")} {p.currency.toUpperCase()}
							</td>
							<td className="py-2.5 pr-3 capitalize">{p.status}</td>
							<td className="py-2.5 pr-3 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
							<td className="py-2.5 text-right">
								{p.method === "manual" && p.status === "pending" && (
									<div className="flex justify-end gap-1.5">
										{p.hasProof && (
											<button type="button" onClick={() => openProof(p.id)} className="rounded-md bg-white/[0.06] px-2 py-1 text-xs hover:bg-white/[0.1]">
												View proof
											</button>
										)}
										<Button size="sm" variant="outline" data-testid={`approve-${p.id}`} disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, approve: true })}>
											Approve
										</Button>
										<Button size="sm" variant="outline" data-testid={`reject-${p.id}`} disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, approve: false })}>
											Reject
										</Button>
									</div>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
