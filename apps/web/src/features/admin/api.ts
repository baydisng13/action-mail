import type { AdminOrgRow, AdminOverview, AdminUserRow, PlanId } from "@postscript/types";
import { apiClient } from "@/lib/api-client";

export const adminApi = {
	async overview(): Promise<AdminOverview> {
		return (await apiClient.get<AdminOverview>("/api/admin/overview")).data;
	},
	async orgs(q: string): Promise<AdminOrgRow[]> {
		const res = await apiClient.get<{ orgs: AdminOrgRow[] } | AdminOrgRow[]>("/api/admin/orgs", { params: { q } });
		return Array.isArray(res.data) ? res.data : res.data.orgs;
	},
	async users(q: string): Promise<AdminUserRow[]> {
		const res = await apiClient.get<{ users: AdminUserRow[] } | AdminUserRow[]>("/api/admin/users", { params: { q } });
		return Array.isArray(res.data) ? res.data : res.data.users;
	},
	async grant(id: string, plan: PlanId | null, seats?: number): Promise<void> {
		await apiClient.post(`/api/admin/orgs/${id}/grant`, { plan, seats });
	},
	async suspend(id: string, suspended: boolean, reason?: string): Promise<void> {
		await apiClient.post(`/api/admin/orgs/${id}/suspend`, { suspended, reason });
	},
};
