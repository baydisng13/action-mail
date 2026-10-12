import { describe, expect, it } from "vitest";
import { detectCurrency, usdToEtbWhole } from "@postscript/types";

describe("currency conversion", () => {
	it("rounds to the nearest whole birr", () => {
		expect(usdToEtbWhole(9, 167)).toBe(1503);
		expect(usdToEtbWhole(9, 167.4)).toBe(1507); // 1506.6 -> 1507
		expect(usdToEtbWhole(0, 167)).toBe(0);
	});
});

describe("country/currency detection", () => {
	it("prefers the Cloudflare country header", () => {
		expect(detectCurrency({ cfCountry: "ET" })).toBe("etb");
		expect(detectCurrency({ cfCountry: "us" })).toBe("usd");
		expect(detectCurrency({ cfCountry: "KE" })).toBe("usd");
	});

	it("falls back to timezone, then Accept-Language, when there is no country header", () => {
		expect(detectCurrency({ timeZone: "Africa/Addis_Ababa" })).toBe("etb");
		expect(detectCurrency({ timeZone: "Europe/Paris" })).toBe("usd");
		expect(detectCurrency({ acceptLanguage: "am-ET,am;q=0.9" })).toBe("etb");
		expect(detectCurrency({ acceptLanguage: "en-US,en;q=0.9" })).toBe("usd");
	});

	it("defaults to usd with no signal at all", () => {
		expect(detectCurrency({})).toBe("usd");
	});
});
