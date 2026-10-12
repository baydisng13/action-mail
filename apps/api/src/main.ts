import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { JsonLogger, log } from "./common/logger";
import { env } from "./config/env";
import { runMigrations } from "./db/migrate";

async function bootstrap() {
	process.env.SERVICE_ROLE = "api";
	const e = env(); // fails fast on missing/invalid required env
	if (e.RUN_MIGRATIONS !== "false") await runMigrations(e.DATABASE_URL);

	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		logger: new JsonLogger(),
		rawBody: true, // Polar webhook signatures are checked against the raw body
		bodyParser: true,
	});
	app.useBodyParser("json", { limit: "3mb" });
	app.set("trust proxy", 1);
	app.disable("x-powered-by");
	app.setGlobalPrefix("api");
	app.use(cookieParser());
	app.enableCors({
		origin: [e.APP_URL],
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: ["content-type", "authorization", "cf-ipcountry"],
		maxAge: 600,
	});
	app.use((req: Request, res: Response, next: NextFunction) => {
		res.setHeader("x-content-type-options", "nosniff");
		res.setHeader("referrer-policy", "no-referrer");
		res.setHeader("x-frame-options", "DENY");
		if (e.API_URL.startsWith("https://")) res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
		const started = Date.now();
		res.on("finish", () => {
			if (req.path === "/api/health") return;
			// Paths only (ids, no query strings): never addresses or content.
			log.info("http", { method: req.method, path: req.path.replace(/\/[A-Za-z0-9_-]{12,}/g, "/:id"), status: res.statusCode, ms: Date.now() - started });
		});
		next();
	});
	app.enableShutdownHooks();
	await app.listen(e.PORT, "0.0.0.0");
	log.info("api.listening", { port: e.PORT });
}

bootstrap().catch((err) => {
	log.error("api.boot_failed", { err });
	process.exit(1);
});
