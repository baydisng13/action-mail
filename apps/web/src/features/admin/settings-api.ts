import type { PlatformSettingsResponse, SettingGroupId, SettingTestResult } from "@postscript/types";
import { apiClient } from "@/lib/api-client";

export const platformSettingsApi = {
	async get(): Promise<PlatformSettingsResponse> {
		return (await apiClient.get<PlatformSettingsResponse>("/api/admin/settings")).data;
	},
	async update(updates: Record<string, string>): Promise<PlatformSettingsResponse> {
		return (await apiClient.put<PlatformSettingsResponse>("/api/admin/settings", { updates })).data;
	},
	async test(group: SettingGroupId, testAddress?: string): Promise<SettingTestResult> {
		return (await apiClient.post<SettingTestResult>(`/api/admin/settings/test/${group}`, { testAddress })).data;
	},
};
