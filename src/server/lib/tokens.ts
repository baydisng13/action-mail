import { createHash, randomBytes } from "node:crypto";

/**
 * Generate an opaque, high-entropy secret (returned to the client) alongside
 * its SHA-256 hash (stored in the DB). We only ever persist the hash, so a
 * database leak never exposes usable tokens.
 */
export function generateSecret(bytes = 32): { secret: string; hash: string } {
	const secret = randomBytes(bytes).toString("base64url");
	return { secret, hash: hashSecret(secret) };
}

export function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}
