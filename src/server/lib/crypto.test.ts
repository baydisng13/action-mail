import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

describe("token encryption (AES-256-GCM)", () => {
	it("round-trips a secret", () => {
		const secret = "ya29.a0AfB_by-some-oauth-access-token";
		expect(decryptSecret(encryptSecret(secret))).toBe(secret);
	});

	it("produces different ciphertext each time (random iv)", () => {
		const a = encryptSecret("same");
		const b = encryptSecret("same");
		expect(a).not.toBe(b);
		expect(decryptSecret(a)).toBe("same");
		expect(decryptSecret(b)).toBe("same");
	});

	it("ciphertext does not contain the plaintext", () => {
		const enc = encryptSecret("super-secret-refresh-token");
		expect(enc).not.toContain("super-secret");
	});

	it("rejects tampered ciphertext (auth tag)", () => {
		const enc = encryptSecret("payload");
		const bytes = Buffer.from(enc, "base64");
		bytes[bytes.length - 1] ^= 0xff; // flip a byte in the ciphertext
		expect(() => decryptSecret(bytes.toString("base64"))).toThrow();
	});
});
