import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { log } from "../common/logger";

const MIGRATION_LOCK_KEY = 7_311_204_517;

/**
 * Apply pending Drizzle migrations on api start. An advisory lock keeps it
 * safe when several api replicas boot together.
 */
export async function runMigrations(url: string): Promise<void> {
	const client = postgres(url, { max: 1, onnotice: () => {} });
	const db = drizzle(client);
	const folder = join(__dirname, "..", "..", "drizzle");
	try {
		await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
		log.info("migrations.start", { folder });
		await migrate(db, { migrationsFolder: folder });
		log.info("migrations.done");
	} finally {
		await db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`).catch(() => undefined);
		await client.end();
	}
}
