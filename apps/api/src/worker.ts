import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { JsonLogger, log } from "./common/logger";
import { env } from "./config/env";
import { WorkerModule } from "./worker/worker.module";

async function bootstrap() {
	process.env.SERVICE_ROLE = "worker";
	env();
	const app = await NestFactory.createApplicationContext(WorkerModule, { logger: new JsonLogger() });
	app.enableShutdownHooks();
}

bootstrap().catch((err) => {
	log.error("worker.boot_failed", { err });
	process.exit(1);
});
