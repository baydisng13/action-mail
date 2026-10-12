import { expect, test } from "@playwright/test";
import { loginOrRegisterAdmin, openSettings, register } from "./helpers";

test("Ethiopian visitor sees birr prices on the pricing page", async ({ page }) => {
	await page.setExtraHTTPHeaders({ "CF-IPCountry": "ET" });
	await page.goto("/pricing");
	await expect(page.getByTestId("currency-etb")).toHaveAttribute("aria-selected", "true");
	await expect(page.getByTestId("plan-pro-price")).toContainText("Birr");
});

test("admin changes the USD to ETB rate and the pricing page picks it up", async ({ page }) => {
	await loginOrRegisterAdmin(page);
	await page.goto("/app/admin/settings");
	await expect(page.getByTestId("platform-settings")).toBeVisible();
	await page.getByTestId("setting-input-USD_TO_ETB").fill("200");
	await page.getByTestId("settings-save-currency").click();

	await page.setExtraHTTPHeaders({ "CF-IPCountry": "ET" });
	await page.goto("/pricing");
	await expect(page.getByTestId("plan-pro-price")).toContainText("1,800 Birr"); // 9 USD * 200

	// Reset so later tests see the default rate.
	await page.setExtraHTTPHeaders({});
	await page.goto("/app/admin/settings");
	await page.getByTestId("setting-input-USD_TO_ETB").fill("");
	await page.getByTestId("settings-save-currency").click();
});

test("manual proof payment: customer submits, admin approves, plan becomes active", async ({ page, browser }) => {
	await loginOrRegisterAdmin(page);
	await page.goto("/app/admin/settings");
	const manualToggle = page.getByTestId("setting-toggle-PAYMENT_MANUAL_ENABLED");
	if ((await manualToggle.getAttribute("aria-checked")) !== "true") {
		await manualToggle.click();
		await page.getByTestId("settings-save-methods").click();
	}

	const customerCtx = await browser.newContext();
	const customerPage = await customerCtx.newPage();
	await register(customerPage);
	await openSettings(customerPage, "billing");
	await customerPage.getByTestId("pay-in-birr-pro").click();
	await customerPage.getByTestId("method-manual").click();
	await customerPage.getByTestId("manual-file").setInputFiles({
		name: "proof.png",
		mimeType: "image/png",
		buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	});
	await customerPage.getByTestId("manual-submit").click();
	await expect(customerPage.getByTestId(/pay-in-birr-dialog-/)).toHaveCount(0, { timeout: 10_000 });

	await page.goto("/app/admin/payments");
	await page.getByTestId("payments-filter-pending").click();
	const approveButton = page.locator('[data-testid^="approve-"]').first();
	await expect(approveButton).toBeVisible({ timeout: 10_000 });
	await approveButton.click();

	await openSettings(customerPage, "billing");
	await customerPage.reload();
	await expect(customerPage.getByTestId("current-plan")).toHaveText("Pro", { timeout: 10_000 });
	await customerCtx.close();
});

test("Continue with Google is hidden until configured, then shown", async ({ page }) => {
	await page.goto("/register");
	await expect(page.getByTestId("google-auth-button")).toHaveCount(0);

	await loginOrRegisterAdmin(page);
	await page.goto("/app/admin/settings");
	await page.getByTestId("setting-input-GOOGLE_CLIENT_ID").fill("test-client-id.apps.googleusercontent.com");
	await page.getByTestId("setting-input-GOOGLE_CLIENT_SECRET").fill("test-secret-value");
	await page.getByTestId("settings-save-google").click();

	await page.goto("/register");
	await expect(page.getByTestId("google-auth-button")).toBeVisible();

	// Reset so later tests see Google as unconfigured.
	await page.goto("/app/admin/settings");
	await page.getByTestId("setting-input-GOOGLE_CLIENT_ID").fill("");
	await page.getByTestId("setting-input-GOOGLE_CLIENT_SECRET").fill("");
	await page.getByTestId("settings-save-google").click();
});
