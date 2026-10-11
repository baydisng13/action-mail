import { expect, type Page, test } from "@playwright/test";
import { connectImap, register, uid } from "./helpers";

/** Reload the inbox until a thread with this subject shows up (sync is async). */
async function waitForThread(page: Page, subject: string, view = "inbox", timeout = 90_000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		await page.goto(`/app?view=${view}`);
		const row = page.getByTestId("thread-row").filter({ hasText: subject });
		// isVisible() does not wait; give the list time to load after navigation.
		const found = await row
			.first()
			.waitFor({ state: "visible", timeout: 8_000 })
			.then(() => true)
			.catch(() => false);
		if (found) return row.first();
		await page.waitForTimeout(4_000);
	}
	throw new Error(`Thread "${subject}" did not appear in ${view}`);
}

test("compose, receive, reply and archive over IMAP/SMTP", async ({ page }) => {
	test.setTimeout(300_000);
	await register(page);
	await connectImap(page, "alice@ps.test");
	await expect(page.getByTestId("mailbox-row")).toHaveCount(1, { timeout: 30_000 });

	const subject = `E2E hello ${uid()}`;
	await page.goto("/app");
	await page.getByTestId("compose-button").click();
	const compose = page.getByTestId("compose-window");
	await expect(compose).toBeVisible();
	await page.getByTestId("compose-to").fill("alice@ps.test");
	await page.getByTestId("compose-subject").click();
	await page.getByTestId("compose-subject").fill(subject);
	await page.getByTestId("compose-body").click();
	await page.keyboard.type("Hi Alice, this is an end to end test.");
	await page.getByTestId("compose-send").click();
	await expect(compose).toBeHidden();
	// Wait out the undo window before checking delivery.
	await page.waitForTimeout(12_000);

	const row = await waitForThread(page, subject);
	await row.click();
	await expect(page.getByTestId("thread-title")).toHaveText(subject);

	// Reply
	await page.getByTestId("reply").click();
	await expect(compose).toBeVisible();
	await expect(page.getByTestId("compose-subject")).toHaveValue(/Re:/i);
	await page.getByTestId("compose-body").click();
	await page.keyboard.press("Control+Home");
	await page.keyboard.type("Replying to myself. ");
	await page.getByTestId("compose-send").click();
	await expect(compose).toBeHidden();
	await page.waitForTimeout(12_000);

	// Archive: gone from Inbox, present in Archive.
	const again = await waitForThread(page, subject);
	await again.click();
	await page.getByTestId("thread-archive").click();
	await expect(page.getByTestId("thread-row").filter({ hasText: subject })).toHaveCount(0, { timeout: 30_000 });
	await waitForThread(page, subject, "archive", 60_000);
});
