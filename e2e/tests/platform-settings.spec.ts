import { expect, test } from "@playwright/test";
import { openSettings, PASSWORD, register } from "./helpers";

const API_URL = process.env.API_URL ?? "http://api.ps.test:3000";

async function loginOrRegisterAdmin(page: import("@playwright/test").Page) {
	const email = "theodore@digicom.et"; // matches PLATFORM_ADMIN_EMAILS in e2e/e2e.env
	await page.goto("/login");
	await page.locator("#email").fill(email);
	await page.locator("#password").fill(PASSWORD);
	await page.getByTestId("login-submit").click();
	const loggedIn = await page
		.waitForURL(/\/app|\/onboarding/, { timeout: 8_000 })
		.then(() => true)
		.catch(() => false);
	if (!loggedIn) await register(page, { email, name: "Theodore" });
}

test("admin saves an AI key, sees it masked and the group marked configured", async ({ page }) => {
	await loginOrRegisterAdmin(page);
	await openSettings(page);
	await page.getByTestId("nav-admin").click();
	await page.getByTestId("nav-platform-settings").click();
	await expect(page.getByTestId("platform-settings")).toBeVisible();

	await expect(page.getByTestId("settings-status-ai")).toHaveText("not configured");
	await page.getByTestId("setting-input-AI_API_KEY").fill("sk-test-abcdefghijkl1234");
	await page.getByTestId("settings-save-ai").click();
	await expect(page.getByTestId("settings-status-ai")).toHaveText("configured", { timeout: 10_000 });
	// The field clears after a save (replace-to-change secrets) and the placeholder shows the saved mask.
	await expect(page.getByTestId("setting-input-AI_API_KEY")).toHaveValue("");
	const placeholder = await page.getByTestId("setting-input-AI_API_KEY").getAttribute("placeholder");
	expect(placeholder).toContain("1234");
	expect(placeholder).not.toContain("abcdefghijkl");

	// Clear it again so other e2e runs / suites see AI as unconfigured.
	await page.getByTestId("setting-input-AI_API_KEY").fill("");
	await page.getByTestId("settings-save-ai").click();
});

test("non-admin cannot read platform settings (403) and does not see the admin nav", async ({ page, request }) => {
	let accessToken: string | undefined;
	page.on("response", async (res) => {
		if (res.request().method() === "POST" && res.url().endsWith("/api/auth/register")) {
			try {
				const body = (await res.json()) as { accessToken?: string };
				if (body.accessToken) accessToken = body.accessToken;
			} catch {
				// not json / no body
			}
		}
	});
	await register(page);
	await openSettings(page);
	await expect(page.getByTestId("nav-admin")).toHaveCount(0);

	expect(accessToken, "register should return an access token with no email provider configured").toBeTruthy();
	const res = await request.get(`${API_URL}/api/admin/settings`, { headers: { authorization: `Bearer ${accessToken}` } });
	expect(res.status()).toBe(403);
});
