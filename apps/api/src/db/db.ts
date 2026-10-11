import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export const DB = Symbol("DB");
export const SQL = Symbol("SQL");

export function createSql(url = env().DATABASE_URL, max = 10) {
	return postgres(url, { max, onnotice: () => {} });
}

export function createDb(client: ReturnType<typeof postgres>): Db {
	return drizzle(client, { schema, casing: "snake_case" });
}

export { schema };
