import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
	it("verifies a correct password", async () => {
		const hash = await hashPassword("correct horse battery");
		expect(hash).not.toBe("correct horse battery");
		expect(await verifyPassword("correct horse battery", hash)).toBe(true);
	});

	it("rejects a wrong password", async () => {
		const hash = await hashPassword("s3cret-pw");
		expect(await verifyPassword("wrong-pw", hash)).toBe(false);
	});

	it("produces a different hash each time (random salt)", async () => {
		const a = await hashPassword("same");
		const b = await hashPassword("same");
		expect(a).not.toBe(b);
	});
});
