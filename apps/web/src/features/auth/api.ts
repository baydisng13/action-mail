import type {
	ChangePasswordInput,
	ConfigResponse,
	ForgotPasswordInput,
	InvitePreview,
	LoginInput,
	MeResponse,
	RegisterInput,
	RegisterResponse,
	ResetPasswordInput,
} from "@postscript/types";
import { apiClient } from "@/lib/api-client";
import { setAccessToken } from "@/lib/auth-token";

export const authApi = {
	async config(): Promise<ConfigResponse> {
		return (await apiClient.get<ConfigResponse>("/api/config")).data;
	},
	async register(input: RegisterInput): Promise<RegisterResponse> {
		const res = await apiClient.post<RegisterResponse>("/api/auth/register", input);
		if (res.data.accessToken) setAccessToken(res.data.accessToken);
		return res.data;
	},
	async login(input: LoginInput): Promise<void> {
		const res = await apiClient.post<{ accessToken: string }>("/api/auth/login", input);
		setAccessToken(res.data.accessToken);
	},
	async logout(): Promise<void> {
		try {
			await apiClient.post("/api/auth/logout");
		} finally {
			setAccessToken(null);
		}
	},
	async me(): Promise<MeResponse> {
		return (await apiClient.get<MeResponse>("/api/me")).data;
	},
	async verifyEmail(token: string): Promise<void> {
		await apiClient.post("/api/auth/verify-email", { token });
	},
	async resendVerification(email: string): Promise<void> {
		await apiClient.post("/api/auth/resend-verification", { email });
	},
	async forgotPassword(input: ForgotPasswordInput): Promise<void> {
		await apiClient.post("/api/auth/forgot-password", input);
	},
	async resetPassword(input: ResetPasswordInput): Promise<void> {
		await apiClient.post("/api/auth/reset-password", input);
	},
	async changePassword(input: ChangePasswordInput): Promise<void> {
		await apiClient.post("/api/auth/change-password", input);
	},
	async updateProfile(fullName: string): Promise<void> {
		await apiClient.patch("/api/account/profile", { fullName });
	},
	async exportData(): Promise<Blob> {
		const res = await apiClient.get("/api/account/export", { responseType: "blob" });
		return res.data as Blob;
	},
	async deleteAccount(password?: string): Promise<void> {
		await apiClient.post("/api/account/delete", { password, confirm: "DELETE" });
		setAccessToken(null);
	},
	async invitePreview(token: string): Promise<InvitePreview> {
		return (await apiClient.get<InvitePreview>(`/api/invites/${encodeURIComponent(token)}`)).data;
	},
	async acceptInvite(token: string): Promise<{ accessToken: string; organizationId: string }> {
		const res = await apiClient.post<{ accessToken: string; organizationId: string }>("/api/invites/accept", { token });
		setAccessToken(res.data.accessToken);
		return res.data;
	},
};
