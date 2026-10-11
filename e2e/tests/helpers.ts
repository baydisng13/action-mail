import { expect, type Page } from "@playwright/test";

export const GREENMAIL_HOST = process.env.GREENMAIL_HOST ?? "greenmail";
export const IMAP_PORT = Number(process.env.GREENMAIL_IMAP_PORT ?? 3143);
export const SMTP_PORT = Number(process.env.GREENMAIL_SMTP_PORT ?? 3025);
export const MAIL_PASSWORD = process.env.GREENMAIL_PASSWORD ?? "secret";

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const PASSWORD = "correct-horse-battery";

/** Register a fresh account. With no Resend key the api signs us in at once. */
export async function register(page: Page, opts: { email?: string; name?: string } = {}) {
	const email = opts.email ?? `user-${uid()}@example.com`;
	const name = opts.name ?? "Test User";
	await page.goto("/register");
	await page.locator("#fullName").fill(name);
	await page.locator("#email").fill(email);
	await page.locator("#password").fill(PASSWORD);
	await page.getByTestId("register-submit").click();
	await expect(page).toHaveURL(/\/onboarding|\/app/, { timeout: 30_000 });
	return { email, name };
}

/** Open the app shell (skipping onboarding when no mailbox is connected). */
export async function openSettings(page: Page, tab?: "account" | "workspace" | "billing" | "mailboxes") {
	await page.goto(tab ? `/app/settings?tab=${tab}` : "/app/settings");
	await expect(page.getByTestId("workspace-switcher")).toBeVisible();
}

/** Connect a GreenMail IMAP mailbox through the dialog (Settings > Mailboxes). */
export async function connectImap(page: Page, email: string) {
	await openSettings(page, "mailboxes");
	await page.getByTestId("connect-imap").click();
	await page.getByTestId("imap-provider-custom").click();
	await page.getByTestId("imap-email").fill(email);
	await page.getByTestId("imap-host").fill(GREENMAIL_HOST);
	await page.getByTestId("imap-port").fill(String(IMAP_PORT));
	await page.getByTestId("smtp-host").fill(GREENMAIL_HOST);
	await page.getByTestId("smtp-port").fill(String(SMTP_PORT));
	await page.getByTestId("imap-tls").uncheck();
	await page.getByTestId("imap-username").fill(email);
	await page.getByTestId("imap-password").fill(MAIL_PASSWORD);
	await page.getByTestId("imap-submit").click();
}
