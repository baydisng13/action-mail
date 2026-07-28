import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
} from "node:crypto";
import { serverEnv } from "@/env.server";

/**
 * Symmetric encryption for OAuth tokens at rest (PRD §10 — encrypted at rest).
 * AES-256-GCM: authenticated encryption. Stored format is base64 of
 * iv(12) || authTag(16) || ciphertext.
 */
const key = Buffer.from(serverEnv.MAILBOX_ENCRYPTION_KEY, "base64");
if (key.length !== 32) {
	throw new Error("MAILBOX_ENCRYPTION_KEY must decode to 32 bytes (base64 of 32)");
}

export function encryptSecret(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(payload: string): string {
	const buf = Buffer.from(payload, "base64");
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const ct = buf.subarray(28);
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
