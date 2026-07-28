import { describe, expect, it } from "vitest";
import { generateSecret, hashSecret } from "./tokens";

describe("token secrets", () => {
	it("hash matches the generated secret", () => {
		const { secret, hash } = generateSecret();
		expect(hashSecret(secret)).toBe(hash);
	});

	it("hashing is deterministic", () => {
		expect(hashSecret("abc")).toBe(hashSecret("abc"));
	});

	it("secrets are unique and high-entropy", () => {
		const a = generateSecret();
		const b = generateSecret();
		expect(a.secret).not.toBe(b.secret);
		expect(a.secret.length).toBeGreaterThanOrEqual(40);
	});

	it("stored hash never equals the raw secret", () => {
		const { secret, hash } = generateSecret();
		expect(hash).not.toBe(secret);
	});
});
