import { z } from "zod";

export const roleSchema = z.enum(["owner", "admin", "member"]);
export const planSchema = z.enum(["free", "pro", "team"]);
export type Role = z.infer<typeof roleSchema>;

export const createOrgSchema = z.object({
	name: z.string().trim().min(2, "At least 2 characters").max(80),
});

export const renameOrgSchema = createOrgSchema;

export const inviteSchema = z.object({
	email: z.string().email(),
	role: z.enum(["admin", "member"]).default("member"),
});

export const acceptInviteSchema = z.object({ token: z.string().min(10) });

export const switchOrgSchema = z.object({ organizationId: z.string().min(1) });

export const updateMemberSchema = z.object({ role: z.enum(["admin", "member"]) });

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
