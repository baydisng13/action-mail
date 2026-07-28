import { apiClient } from "@/lib/api-client";
import { setAccessToken } from "@/lib/auth-token";
import type {
	ChangePasswordInput,
	ForgotPasswordInput,
	LoginInput,
	RegisterInput,
	ResetPasswordInput,
} from "./schemas";
import {
	accessTokenResponse,
	type MeResponse,
	meResponse,
	type RegisterResponse,
	registerResponse,
} from "./types";

/**
 * Auth transport layer. Every response is validated with Zod before it's
 * trusted (per CODE_STANDARDS). Grouped so hooks read like `api.auth.login`.
 */
export const authApi = {
	async register(input: RegisterInput): Promise<RegisterResponse> {
		const res = await apiClient.post("/api/auth/register", input);
		return registerResponse.parse(res.data);
	},

	async login(input: LoginInput): Promise<void> {
		const res = await apiClient.post("/api/auth/login", input);
		const { accessToken } = accessTokenResponse.parse(res.data);
		setAccessToken(accessToken);
	},

	async logout(): Promise<void> {
		await apiClient.post("/api/auth/logout");
		setAccessToken(null);
	},

	async me(): Promise<MeResponse> {
		const res = await apiClient.get("/api/me");
		return meResponse.parse(res.data);
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
};
