import type { InviteInput, InviteView, MemberView, OrgSummary, Role } from "@postscript/types";
import { apiClient } from "@/lib/api-client";
import { setAccessToken } from "@/lib/auth-token";

export const orgsApi = {
	async create(name: string): Promise<{ organization: OrgSummary; accessToken: string }> {
		const res = await apiClient.post<{ organization: OrgSummary; accessToken: string }>("/api/orgs", { name });
		setAccessToken(res.data.accessToken);
		return res.data;
	},
	async switchTo(organizationId: string): Promise<void> {
		const res = await apiClient.post<{ accessToken: string }>("/api/orgs/switch", { organizationId });
		setAccessToken(res.data.accessToken);
	},
	async rename(name: string): Promise<void> {
		await apiClient.patch("/api/orgs/current", { name });
	},
	async remove(): Promise<void> {
		await apiClient.delete("/api/orgs/current");
	},
	async members(): Promise<{ members: MemberView[]; invites: InviteView[] }> {
		return (await apiClient.get<{ members: MemberView[]; invites: InviteView[] }>("/api/orgs/current/members")).data;
	},
	async invite(input: InviteInput): Promise<InviteView> {
		return (await apiClient.post<InviteView>("/api/orgs/current/invites", input)).data;
	},
	async revokeInvite(id: string): Promise<void> {
		await apiClient.delete(`/api/orgs/current/invites/${id}`);
	},
	async setRole(userId: string, role: Exclude<Role, "owner">): Promise<void> {
		await apiClient.patch(`/api/orgs/current/members/${userId}`, { role });
	},
	async removeMember(userId: string): Promise<void> {
		await apiClient.delete(`/api/orgs/current/members/${userId}`);
	},
};
