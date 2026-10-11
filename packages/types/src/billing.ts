import { z } from "zod";

export const checkoutSchema = z.object({
	plan: z.enum(["pro", "team"]),
	interval: z.enum(["month", "year"]).default("month"),
	seats: z.number().int().min(1).max(500).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const adminGrantSchema = z.object({
	/** null removes a manual grant and falls back to the paid subscription. */
	plan: z.enum(["free", "pro", "team"]).nullable(),
	seats: z.number().int().min(1).max(500).optional(),
});

export const adminSuspendSchema = z.object({
	suspended: z.boolean(),
	reason: z.string().max(300).optional(),
});
