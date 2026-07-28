import { z } from "zod";

export const passwordSchema = z
	.string()
	.min(8, "At least 8 characters")
	.max(128);

export const registerSchema = z.object({
	fullName: z.string().min(1, "Enter your name").max(120),
	email: z.string().email(),
	password: passwordSchema,
});

export const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({
	email: z.string().email(),
});

export const resetPasswordSchema = z.object({
	token: z.string().min(1),
	password: passwordSchema,
});

export const verifyEmailSchema = z.object({
	token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
	email: z.string().email(),
});

export const changePasswordSchema = z.object({
	// Optional: absent when a Google-only account sets its first password.
	currentPassword: z.string().optional(),
	newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
