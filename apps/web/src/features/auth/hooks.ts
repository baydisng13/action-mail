import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	ChangePasswordInput,
	ForgotPasswordInput,
	LoginInput,
	RegisterInput,
	ResetPasswordInput,
} from "@postscript/types";
import { getAccessToken } from "@/lib/auth-token";
import { authApi } from "./api";

export const authKeys = {
	me: ["auth", "me"] as const,
	config: ["config"] as const,
};

/** Current user, workspaces, plan limits and usage. */
export function useMe(options?: { enabled?: boolean }) {
	return useQuery({
		queryKey: authKeys.me,
		queryFn: authApi.me,
		enabled: options?.enabled ?? Boolean(getAccessToken()),
		staleTime: 30_000,
		retry: false,
	});
}

/** Public feature flags (which integrations are configured). */
export function useConfig() {
	return useQuery({
		queryKey: authKeys.config,
		queryFn: authApi.config,
		staleTime: 5 * 60_000,
		retry: 1,
	});
}

export function useRegister() {
	return useMutation({ mutationFn: (input: RegisterInput) => authApi.register(input) });
}

export function useLogin() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: LoginInput) => authApi.login(input),
		onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
	});
}

export function useLogout() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => authApi.logout(),
		onSettled: () => qc.clear(),
	});
}

export function useVerifyEmail() {
	return useMutation({ mutationFn: (token: string) => authApi.verifyEmail(token) });
}

export function useResendVerification() {
	return useMutation({ mutationFn: (email: string) => authApi.resendVerification(email) });
}

export function useForgotPassword() {
	return useMutation({ mutationFn: (input: ForgotPasswordInput) => authApi.forgotPassword(input) });
}

export function useResetPassword() {
	return useMutation({ mutationFn: (input: ResetPasswordInput) => authApi.resetPassword(input) });
}

export function useChangePassword() {
	return useMutation({ mutationFn: (input: ChangePasswordInput) => authApi.changePassword(input) });
}

export function useUpdateProfile() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (fullName: string) => authApi.updateProfile(fullName),
		onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
	});
}
