import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { serverEnv } from "@/env.server";
import * as schema from "./schema";

// Neon needs a WebSocket implementation for transactions. Prefer Node's global
// WebSocket (Node 22+ / undici) — the bundled `ws` package breaks under esbuild
// ("bufferUtil.mask is not a function"). Fall back to `ws` on older runtimes.
if (!neonConfig.webSocketConstructor) {
	neonConfig.webSocketConstructor =
		typeof globalThis.WebSocket !== "undefined"
			? (globalThis.WebSocket as unknown as typeof ws)
			: ws;
}
// Route non-transaction pool queries over HTTP fetch instead of a WebSocket.
// Far more robust in serverless / bundled runtimes (Vercel), where a per-query
// WebSocket often drops with "Connection terminated unexpectedly".
neonConfig.poolQueryViaFetch = true;

// Reuse a single Pool across HMR reloads / serverless invocations.
const globalForDb = globalThis as unknown as {
	__pool?: Pool;
	__db?: ReturnType<typeof drizzle<typeof schema>>;
};

const pool =
	globalForDb.__pool ?? new Pool({ connectionString: serverEnv.DATABASE_URL });

export const db =
	globalForDb.__db ?? drizzle(pool, { schema, casing: "snake_case" });

if (serverEnv.NODE_ENV !== "production") {
	globalForDb.__pool = pool;
	globalForDb.__db = db;
}

export { schema };
