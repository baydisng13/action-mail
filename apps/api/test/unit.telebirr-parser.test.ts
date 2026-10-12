import { describe, expect, it } from "vitest";
import { parseTelebirrReceipt } from "../src/payments/telebirr-parser";

/**
 * Synthetic fixture modeled on the written spec (label: value rows). This
 * has NOT been checked against a real Ethio Telecom receipt — if a field
 * comes back null for a real transaction, adjust the label patterns in
 * telebirr-parser.ts to match the real wording.
 */
const FIXTURE_HTML = `
<html><body>
<table>
  <tr><td>Payer Name</td><td>:</td><td>Abebe Kebede</td></tr>
  <tr><td>Payer Telebirr No.</td><td>:</td><td>0911223344</td></tr>
  <tr><td>Receiver Name</td><td>:</td><td>Postscript PLC</td></tr>
  <tr><td>Receiver Account No.</td><td>:</td><td>0922334455</td></tr>
  <tr><td>Payment Date &amp; Time</td><td>:</td><td>10/12/2026 14:05:00</td></tr>
  <tr><td>Transaction Status</td><td>:</td><td>Completed</td></tr>
  <tr><td>Receipt No.</td><td>:</td><td>ABCD1234EFGH</td></tr>
  <tr><td>Total Paid Amount</td><td>:</td><td>1,503.00 ETB</td></tr>
</table>
</body></html>
`;

describe("telebirr receipt parser (synthetic fixture, not verified against a real receipt)", () => {
	it("extracts every field defensively", () => {
		const r = parseTelebirrReceipt(FIXTURE_HTML);
		expect(r.payerName).toBe("Abebe Kebede");
		expect(r.receiverName).toBe("Postscript PLC");
		expect(r.receiverNumber).toBe("0922334455");
		expect(r.amount).toBe(1503);
		expect(r.date).toContain("10/12/2026");
		expect(r.status).toBe("Completed");
		expect(r.transactionId).toBe("ABCD1234EFGH");
	});

	it("never throws on garbage input and returns all nulls", () => {
		const r = parseTelebirrReceipt("<html><body>not a receipt</body></html>");
		expect(r).toEqual({
			payerName: null,
			receiverName: null,
			receiverNumber: null,
			amount: null,
			date: null,
			status: null,
			transactionId: null,
		});
	});

	it("is case and spacing tolerant", () => {
		const html = "<div>receiver   NAME: Jane Doe</div><div>amount: 200</div>";
		const r = parseTelebirrReceipt(html);
		expect(r.receiverName).toBe("Jane Doe");
		expect(r.amount).toBe(200);
	});
});
