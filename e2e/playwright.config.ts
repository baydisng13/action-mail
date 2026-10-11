import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the docker-compose stack (see scripts/e2e.sh):
 *   web       http://web.ps.test:3000
 *   api       http://api.ps.test:3000
 *   greenmail IMAP 3143 / SMTP 3025, users alice@ps.test and bob@ps.test, password "secret"
 */
export default defineConfig({
	testDir: "./tests",
	timeout: 120_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
	use: {
		baseURL: process.env.WEB_URL ?? "http://web.ps.test:3000",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
});
