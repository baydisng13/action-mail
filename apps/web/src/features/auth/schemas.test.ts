import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, resetPasswordSchema } from "@postscript/types";

describe("registerSchema", () => {
	it("accepts a valid registration", () => {
		const r = registerSchema.safeParse({
			fullName: "Theodore",
			email: "theo@example.com",
			password: "longenough1",
		});
		expect(r.success).toBe(true);
	});

	it("requires a full name", () => {
		const r = registerSchema.safeParse({
			fullName: "",
			email: "theo@example.com",
			password: "longenough1",
		});
		expect(r.success).toBe(false);
	});

	it("rejects a short password", () => {
		const r = registerSchema.safeParse({
			fullName: "Theo",
			email: "theo@example.com",
			password: "short",
		});
		expect(r.success).toBe(false);
	});

	it("rejects a bad email", () => {
		const r = registerSchema.safeParse({
			fullName: "Theo",
			email: "not-an-email",
			password: "longenough1",
		});
		expect(r.success).toBe(false);
	});
});

describe("loginSchema", () => {
	it("requires a non-empty password", () => {
		expect(
			loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
		).toBe(false);
	});
});

describe("resetPasswordSchema", () => {
	it("needs both token and a valid password", () => {
		expect(
			resetPasswordSchema.safeParse({ token: "t", password: "longenough1" })
				.success,
		).toBe(true);
		expect(
			resetPasswordSchema.safeParse({ token: "", password: "longenough1" })
				.success,
		).toBe(false);
	});
});
