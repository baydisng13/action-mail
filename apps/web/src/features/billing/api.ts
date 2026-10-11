import type { BillingSummary, CheckoutInput } from "@postscript/types";
import { apiClient } from "@/lib/api-client";

export const billingApi = {
	async summary(): Promise<BillingSummary> {
		return (await apiClient.get<BillingSummary>("/api/billing")).data;
	},
	async checkout(input: CheckoutInput): Promise<string> {
		return (await apiClient.post<{ url: string }>("/api/billing/checkout", input)).data.url;
	},
	async portal(): Promise<string> {
		return (await apiClient.post<{ url: string }>("/api/billing/portal")).data.url;
	},
};
