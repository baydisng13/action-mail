/** Tiny event bus: any 402 limit error opens the upgrade dialog. */
export type UpgradeCode = "mailbox_limit" | "ai_limit" | "seat_limit";
export interface UpgradeEvent {
	code: UpgradeCode;
	message: string;
}

const listeners = new Set<(e: UpgradeEvent) => void>();
const CODES = new Set<string>(["mailbox_limit", "ai_limit", "seat_limit"]);

export function onUpgrade(fn: (e: UpgradeEvent) => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function emitUpgrade(e: UpgradeEvent): void {
	for (const fn of listeners) fn(e);
}

export function isUpgradeCode(code: string | undefined): code is UpgradeCode {
	return Boolean(code && CODES.has(code));
}
