import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config(); // load .env into process.env for the CLI

// drizzle-kit reads process.env directly (run via `pnpm db:*`).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	casing: "snake_case",
	dbCredentials: { url },
	verbose: true,
	strict: true,
});
