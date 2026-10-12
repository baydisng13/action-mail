import { describe, expect, it } from "vitest";
import { decryptPlatformSetting, encryptPlatformSetting, maskSecret } from "../src/common/crypto";

describe("platform settings encryption", () => {
	it("round-trips and never stores plaintext", () => {
		const enc = encryptPlatformSetting("sk-super-secret-value-123456");
		expect(enc).not.toContain("sk-super-secret-value-123456");
		expect(decryptPlatformSetting(enc)).toBe("sk-super-secret-value-123456");
	});

	it("produces different ciphertext each time (random iv)", () => {
		const a = encryptPlatformSetting("same-value");
		const b = encryptPlatformSetting("same-value");
		expect(a).not.toBe(b);
		expect(decryptPlatformSetting(a)).toBe("same-value");
		expect(decryptPlatformSetting(b)).toBe("same-value");
	});
});

describe("maskSecret", () => {
	it("never reveals the full secret", () => {
		const masked = maskSecret("sk-abcdefghijkl1234");
		expect(masked).not.toContain("abcdefghijkl");
		expect(masked.endsWith("1234")).toBe(true);
		expect(masked).toContain("…");
	});

	it("masks short values entirely", () => {
		expect(maskSecret("abc")).toBe("••••");
	});
});
