import { z } from "zod";

export const roleSchema = z.enum(["owner", "admin", "member"]);
export const planSchema = z.enum(["free", "pro", "team"]);

export const accessTokenResponse = z.object({
	accessToken: z.string(),
});

export const registerResponse = z.object({
	userId: z.string(),
	needsVerification: z.boolean(),
});

export const meResponse = z.object({
	user: z.object({
		id: z.string(),
		fullName: z.string(),
		email: z.string(),
		emailVerified: z.boolean(),
		hasPassword: z.boolean(),
		avatarUrl: z.string().nullable(),
	}),
	memberships: z.array(
		z.object({
			teamId: z.string(),
			teamName: z.string(),
			teamSlug: z.string(),
			isPersonal: z.boolean(),
			isOwner: z.boolean(),
			role: roleSchema,
			plan: planSchema,
		}),
	),
	activeTeam: z.object({
		id: z.string(),
		name: z.string(),
		role: roleSchema,
		plan: planSchema,
	}),
	entitlements: z.array(z.string()),
});

export type MeResponse = z.infer<typeof meResponse>;
export type RegisterResponse = z.infer<typeof registerResponse>;
