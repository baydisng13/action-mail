import type { PaymentOptionsResponse, PaymentRow, SettingTestResult } from "@postscript/types";
import { apiClient } from "@/lib/api-client";

export const paymentsApi = {
	async options(): Promise<PaymentOptionsResponse> {
		return (await apiClient.get<PaymentOptionsResponse>("/api/payments/options")).data;
	},
	async chapaInit(plan: "pro" | "team", periodMonths: number): Promise<{ checkoutUrl: string }> {
		return (await apiClient.post("/api/payments/chapa/init", { plan, periodMonths })).data;
	},
	async telebirrSubmit(plan: "pro" | "team", periodMonths: number, txnId: string): Promise<SettingTestResult> {
		return (await apiClient.post("/api/payments/telebirr/submit", { plan, periodMonths, txnId })).data;
	},
	async manualSubmit(plan: "pro" | "team", periodMonths: number, file: File, note?: string): Promise<{ id: string }> {
		const form = new FormData();
		form.append("plan", plan);
		form.append("periodMonths", String(periodMonths));
		if (note) form.append("note", note);
		form.append("file", file);
		return (await apiClient.post("/api/payments/manual/submit", form, { headers: { "content-type": "multipart/form-data" } })).data;
	},
};

export const adminPaymentsApi = {
	async list(status?: string, method?: string): Promise<PaymentRow[]> {
		return (await apiClient.get<PaymentRow[]>("/api/admin/payments", { params: { status, method } })).data;
	},
	async approve(id: string): Promise<void> {
		await apiClient.post(`/api/admin/payments/${id}/approve`);
	},
	async reject(id: string): Promise<void> {
		await apiClient.post(`/api/admin/payments/${id}/reject`);
	},
};
