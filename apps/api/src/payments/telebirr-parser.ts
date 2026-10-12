import type { TelebirrReceiptFields } from "@postscript/types";

const CELL = "\u0001";

/** Table rows (or plain lines) as arrays of trimmed cells, tags stripped. */
function rowsOf(html: string): string[][] {
	const text = html
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<tr[^>]*>/gi, "\n")
		.replace(/<\/(p|div|li|br)>/gi, "\n")
		.replace(/<t[dh][^>]*>/gi, CELL)
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&");
	return text.split("\n").map((line) =>
		line
			.split(CELL)
			.map((c) => c.replace(/\s+/g, " ").trim())
			.filter(Boolean),
	);
}

/**
 * Finds a row whose cells include a label matching `labelRe`, then returns
 * the trailing cell that is not just a ":" or "-" separator — handling
 * 3-cell rows (label | : | value), 2-cell rows (label | value), and a
 * single "Label: Value" line, since receipt templates vary.
 */
function findValue(rows: string[][], labelRe: RegExp): string | null {
	for (const cells of rows) {
		const idx = cells.findIndex((c) => labelRe.test(c));
		if (idx === -1) continue;
		for (let i = cells.length - 1; i > idx; i--) {
			if (cells[i] && !/^[:\-]+$/.test(cells[i])) return cells[i];
		}
		const inline = cells[idx].match(/[:\-]\s*(.+)/);
		if (inline?.[1]) return inline[1].trim();
	}
	return null;
}

/**
 * Pulls payer/receiver/amount/date/status out of an Ethio Telecom Telebirr
 * receipt page. Written from the written spec (no access to a real receipt
 * or Mon's parser), so it is defensive: every field can come back null
 * rather than throwing, and label matching is loose (templates vary in
 * exact wording and markup). Should be checked against a real receipt and
 * the label patterns adjusted if a field comes back null in production.
 */
export function parseTelebirrReceipt(html: string): TelebirrReceiptFields {
	const rows = rowsOf(html);
	const amountRaw = findValue(rows, /(total\s*(paid|amount)|settled\s*amount|\bamount\b)/i);
	const amountMatch = amountRaw?.match(/([0-9][0-9.,]*)/);
	const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;

	return {
		payerName: findValue(rows, /payer\s*name/i),
		receiverName: findValue(rows, /(receiver|receiving|credited party|beneficiary)\s*name/i),
		receiverNumber: findValue(rows, /(receiver|receiving|credited party|beneficiary)\s*(phone|mobile|number|account)/i),
		amount: amount != null && Number.isFinite(amount) ? amount : null,
		date: findValue(rows, /(payment\s*date|transaction\s*date|date\s*(&|and)?\s*time)/i),
		status: findValue(rows, /(transaction\s*status|\bstatus\b)/i),
		transactionId: findValue(rows, /(receipt\s*(no|number)|transaction\s*(id|number))/i),
	};
}
