import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC keeps decorator metadata, which Nest's DI needs; esbuild drops it.
export default defineConfig({
	plugins: [swc.vite({ module: { type: "es6" } })],
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		fileParallelism: false,
		testTimeout: 20000,
		env: {
			JWT_ACCESS_SECRET: "test-access-secret-at-least-32-chars-long!!",
			JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars-long!",
			MAILBOX_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
			APP_URL: "http://localhost:3000",
			API_URL: "http://localhost:3001",
			NODE_ENV: "test",
			PLATFORM_ADMIN_EMAILS: "boss@example.com",
			DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postscript:postscript@localhost:5432/postscript_test",
			REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
		},
	},
});
