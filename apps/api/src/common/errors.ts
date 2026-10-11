import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	HttpException,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { log } from "./logger";

/** A handled, client-safe error. Anything else becomes a generic 500. */
export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public code?: string,
	) {
		super(message);
	}
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
	catch(err: unknown, host: ArgumentsHost) {
		const res = host.switchToHttp().getResponse<Response>();
		const req = host.switchToHttp().getRequest<{ method: string; url: string }>();
		if (err instanceof ApiError) {
			res.status(err.status).json({ error: { message: err.message, code: err.code } });
			return;
		}
		if (err instanceof ZodError) {
			const first = err.issues[0];
			res.status(400).json({
				error: {
					message: first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid input",
					code: "invalid_input",
				},
			});
			return;
		}
		if (err instanceof HttpException) {
			const status = err.getStatus();
			res.status(status).json({ error: { message: err.message, code: status === 404 ? "not_found" : undefined } });
			return;
		}
		log.error("http.unhandled", { err: err as Error, method: req.method, url: req.url });
		res.status(500).json({ error: { message: "Internal server error" } });
	}
}
