import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { serverEnv } from "@/env.server";
import * as schema from "./schema";

// The Neon serverless driver needs a WebSocket implementation in Node.
// (Browsers/edge provide one natively; Node does not.)
if (!neonConfig.webSocketConstructor) {
	neonConfig.webSocketConstructor = ws;
}

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
