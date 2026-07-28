import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import viteTsConfigPaths from "vite-tsconfig-paths";

config(); // load .env so integration tests can reach the real database

// Real values pass through (integration tests); otherwise safe dummies so the
// pure-logic unit tests can import server modules without a live database.
const e = process.env;

export default defineConfig({
	plugins: [viteTsConfigPaths({ projects: ["./tsconfig.json"] })],
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		env: {
			DATABASE_URL:
				e.DATABASE_URL ?? "postgresql://u:p@localhost:5432/postscript_test",
			JWT_ACCESS_SECRET:
				e.JWT_ACCESS_SECRET ?? "test-access-secret-at-least-32-chars-long!!",
			JWT_REFRESH_SECRET:
				e.JWT_REFRESH_SECRET ?? "test-refresh-secret-at-least-32-chars-long!",
			// base64 of "0123456789abcdef0123456789abcdef" (32 bytes)
			MAILBOX_ENCRYPTION_KEY:
				e.MAILBOX_ENCRYPTION_KEY ??
				"MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
			APP_URL: e.APP_URL ?? "http://localhost:3000",
			NODE_ENV: "test",
		},
	},
});
