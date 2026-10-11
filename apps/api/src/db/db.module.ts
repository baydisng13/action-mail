import { Global, Inject, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import type postgres from "postgres";
import { createDb, createSql, DB, SQL } from "./db";

@Injectable()
class SqlCloser implements OnModuleDestroy {
	constructor(@Inject(SQL) private readonly sql: ReturnType<typeof postgres>) {}
	async onModuleDestroy() {
		await this.sql.end({ timeout: 5 });
	}
}

@Global()
@Module({
	providers: [
		{ provide: SQL, useFactory: () => createSql() },
		{ provide: DB, useFactory: (s: ReturnType<typeof postgres>) => createDb(s), inject: [SQL] },
		SqlCloser,
	],
	exports: [DB, SQL],
})
export class DbModule {}
