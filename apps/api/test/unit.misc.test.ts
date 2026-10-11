import { describe, expect, it } from "vitest";
import { hasActionableContent } from "../src/ai/ai.service";
import { orgCipher } from "../src/common/crypto";
import { scrub } from "../src/common/logger";
import { isPrivateAddress } from "../src/mail/imap.client";
import { gmailQuery, imapCriteria } from "../src/mail/search.service";
import { attachmentUrl, verifyAttachmentSig } from "../src/mail/body";

describe("per-org encryption", () => {
	it("round-trips and differs per org", () => {
		const a = orgCipher("org_a");
		const b = orgCipher("org_b");
		const enc = a.enc({ subject: "Top secret" });
		expect(enc).not.toContain("Top secret");
		expect(a.dec<{ subject: string }>(enc)?.subject).toBe("Top secret");
		expect(b.dec(enc)).toBeNull(); // other org's key can't read it
		expect(a.hash("ID@x")).toBe(a.hash("id@x"));
		expect(a.hash("id@x")).not.toBe(b.hash("id@x"));
	});
});

describe("logs", () => {
	it("scrubs email addresses", () => {
		expect(scrub("login failed for jane.doe@example.com at imap")).toBe("login failed for [email] at imap");
	});
});

describe("search translation", () => {
	it("builds provider queries", () => {
		expect(gmailQuery({ q: "invoice", from: "acme.com", unread: true, attachments: true })).toBe("invoice from:(acme.com) is:unread has:attachment");
		expect(imapCriteria({ q: "invoice", from: "a@b.c", starred: true })).toEqual({ text: "invoice", from: "a@b.c", flagged: true });
		expect(imapCriteria({ q: "" })).toEqual({ all: true });
	});
});

describe("guards", () => {
	it("flags private addresses (SSRF)", () => {
		for (const ip of ["10.0.0.1", "127.0.0.1", "192.168.1.5", "172.20.0.2", "169.254.169.254", "::1", "fd00::1"]) expect(isPrivateAddress(ip)).toBe(true);
		for (const ip of ["8.8.8.8", "142.250.1.1"]) expect(isPrivateAddress(ip)).toBe(false);
	});
	it("only spends AI on actionable mail", () => {
		expect(hasActionableContent("Your verification code", null, null)).toBe(true);
		expect(hasActionableContent("Weekly digest", null, "no links here")).toBe(false);
		expect(hasActionableContent("Hello", null, "Your code is 123456")).toBe(true);
	});
	it("signs attachment links and rejects tampering or expiry", () => {
		const u = new URL(attachmentUrl("m1", "a0"));
		const exp = Number(u.searchParams.get("exp"));
		const sig = u.searchParams.get("sig") as string;
		expect(verifyAttachmentSig("m1", "a0", exp, sig)).toBe(true);
		expect(verifyAttachmentSig("m2", "a0", exp, sig)).toBe(false);
		expect(verifyAttachmentSig("m1", "a0", Math.floor(Date.now() / 1000) - 10, sig)).toBe(false);
	});
});
