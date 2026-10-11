import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env";

/**
 * AES-256-GCM for mailbox secrets at rest. Stored format is base64 of
 * iv(12) || authTag(16) || ciphertext.
 */
function key(): Buffer {
	const k = Buffer.from(env().MAILBOX_ENCRYPTION_KEY, "base64");
	if (k.length !== 32) throw new Error("MAILBOX_ENCRYPTION_KEY must decode to 32 bytes");
	return k;
}

export function encryptSecret(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key(), iv);
	const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(payload: string): string {
	const buf = Buffer.from(payload, "base64");
	const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
	decipher.setAuthTag(buf.subarray(12, 28));
	return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Opaque secret for the client + its SHA-256 hash for the DB. */
export function generateSecret(bytes = 32): { secret: string; hash: string } {
	const secret = randomBytes(bytes).toString("base64url");
	return { secret, hash: hashSecret(secret) };
}

export function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// ─── Per-organization content encryption ────────────────────────────────────

const orgKeys = new Map<string, { enc: Buffer; mac: Buffer }>();

/** Two keys per org (encryption + keyed hashing), derived with HKDF. */
function orgKeyPair(orgId: string) {
	let k = orgKeys.get(orgId);
	if (!k) {
		const master = key();
		k = {
			enc: Buffer.from(hkdfSync("sha256", master, orgId, "postscript-content-v1", 32)),
			mac: Buffer.from(hkdfSync("sha256", master, orgId, "postscript-index-v1", 32)),
		};
		if (orgKeys.size > 5000) orgKeys.clear();
		orgKeys.set(orgId, k);
	}
	return k;
}

export interface OrgCipher {
	enc(value: unknown): string;
	dec<T>(payload: string | null | undefined): T | null;
	encBuf(value: Buffer): Buffer;
	decBuf(payload: Buffer): Buffer;
	/** Deterministic keyed hash for lookups (Message-ID, subject) without plaintext. */
	hash(value: string): string;
}

export function orgCipher(orgId: string): OrgCipher {
	const { enc: k, mac } = orgKeyPair(orgId);
	const encBuf = (plain: Buffer) => {
		const iv = randomBytes(12);
		const c = createCipheriv("aes-256-gcm", k, iv);
		const ct = Buffer.concat([c.update(plain), c.final()]);
		return Buffer.concat([iv, c.getAuthTag(), ct]);
	};
	const decBuf = (buf: Buffer) => {
		const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
		d.setAuthTag(buf.subarray(12, 28));
		return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
	};
	return {
		enc: (value) => encBuf(Buffer.from(JSON.stringify(value), "utf8")).toString("base64"),
		dec: <T>(payload: string | null | undefined): T | null => {
			if (!payload) return null;
			try {
				return JSON.parse(decBuf(Buffer.from(payload, "base64")).toString("utf8")) as T;
			} catch {
				return null;
			}
		},
		encBuf,
		decBuf,
		hash: (value) => createHmac("sha256", mac).update(value.trim().toLowerCase()).digest("base64url").slice(0, 32),
	};
}
