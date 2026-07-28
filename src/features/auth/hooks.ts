import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { getAccessToken } from "@/lib/auth-token";
import { authApi } from "./api";
import type {
	ChangePasswordInput,
	ForgotPasswordInput,
	LoginInput,
	RegisterInput,
	ResetPasswordInput,
} from "./schemas";

export const authKeys = {
	me: ["auth", "me"] as const,
};

/** Current user + teams + entitlements. Enabled once we hold an access token. */
export function useMe(options?: { enabled?: boolean }) {
	return useQuery({
		queryKey: authKeys.me,
		queryFn: authApi.me,
		enabled: options?.enabled ?? Boolean(getAccessToken()),
		staleTime: 60_000,
		retry: false,
	});
}

export function useRegister() {
	return useMutation({
		mutationFn: (input: RegisterInput) => authApi.register(input),
	});
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
		onSuccess: () => qc.clear(),
	});
}

export function useVerifyEmail() {
	return useMutation({ mutationFn: (token: string) => authApi.verifyEmail(token) });
}

export function useResendVerification() {
	return useMutation({
		mutationFn: (email: string) => authApi.resendVerification(email),
	});
}

export function useForgotPassword() {
	return useMutation({
		mutationFn: (input: ForgotPasswordInput) => authApi.forgotPassword(input),
	});
}

export function useResetPassword() {
	return useMutation({
		mutationFn: (input: ResetPasswordInput) => authApi.resetPassword(input),
	});
}

export function useChangePassword() {
	return useMutation({
		mutationFn: (input: ChangePasswordInput) => authApi.changePassword(input),
	});
}
