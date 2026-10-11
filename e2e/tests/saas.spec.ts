import { expect, test } from "@playwright/test";
import { connectImap, openSettings, PASSWORD, register, uid } from "./helpers";

test("register lands in a personal workspace", async ({ page }) => {
	await register(page, { name: "Ada Personal" });
	await openSettings(page, "workspace");
	await expect(page.getByTestId("workspace-switcher")).toContainText("Personal");
	await page.getByTestId("workspace-switcher").click();
	await expect(page.getByTestId("workspace-item")).toHaveCount(1);
	await page.keyboard.press("Escape");
});

test("create a team workspace and invite a member", async ({ page }) => {
	await register(page);
	await openSettings(page);
	await page.getByTestId("workspace-switcher").click();
	await page.getByTestId("create-org-open").click();
	const orgName = `Team ${uid()}`;
	await page.getByTestId("create-org-name").fill(orgName);
	await page.getByTestId("create-org-submit").click();

	await expect(page).toHaveURL(/tab=workspace/);
	await expect(page.getByTestId("workspace-name")).toHaveText(orgName);
	const invitee = `invitee-${uid()}@example.com`;
	await page.getByTestId("invite-email").fill(invitee);
	await page.getByTestId("invite-submit").click();
	await expect(page.getByTestId("invites-list")).toContainText(invitee);
	// No email provider configured in the test stack, so the link is shown to share.
	await expect(page.getByTestId("invite-link")).toContainText("/invite/");
});

test("pricing page shows the three plans", async ({ page }) => {
	await page.goto("/pricing");
	await expect(page.getByTestId("pricing-title")).toBeVisible();
	for (const plan of ["free", "pro", "team"]) {
		await expect(page.getByTestId(`plan-${plan}`)).toBeVisible();
	}
	await page.getByTestId("interval-year").click();
	await expect(page.getByTestId("plan-pro")).toContainText("/ year");
});

test("free plan allows one mailbox", async ({ page }) => {
	await register(page);
	await connectImap(page, "alice@ps.test");
	await expect(page.getByTestId("mailbox-row")).toHaveCount(1, { timeout: 30_000 });
	await expect(page.getByTestId("mailboxes-list")).toContainText("alice@ps.test");

	await connectImap(page, "bob@ps.test");
	await expect(page.getByTestId("upgrade-dialog")).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId("upgrade-dialog")).toContainText(/mailbox/i);
});

test("platform admin sees the admin console", async ({ page }) => {
	// PLATFORM_ADMIN_EMAILS includes this address in the test stack. Reuse the
	// account if an earlier run already created it.
	const email = "theodore@digicom.et";
	await page.goto("/login");
	await page.locator("#email").fill(email);
	await page.locator("#password").fill(PASSWORD);
	await page.getByTestId("login-submit").click();
	const loggedIn = await page
		.waitForURL(/\/app|\/onboarding/, { timeout: 8_000 })
		.then(() => true)
		.catch(() => false);
	if (!loggedIn) await register(page, { email, name: "Theodore" });

	await openSettings(page);
	await expect(page.getByTestId("nav-admin")).toBeVisible();
	await page.getByTestId("nav-admin").click();
	await expect(page.getByTestId("admin-console")).toBeVisible();
	await expect(page.getByTestId("admin-overview")).toContainText("MRR");
	await expect(page.getByTestId("admin-orgs")).toBeVisible();
});

test("regular users do not see the admin link", async ({ page }) => {
	await register(page);
	await openSettings(page);
	await expect(page.getByTestId("nav-admin")).toHaveCount(0);
});
