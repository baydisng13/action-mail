import type { LoggerService } from "@nestjs/common";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
	const l = (process.env.LOG_LEVEL as Level) || "info";
	return ORDER[l] ?? 20;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
	if (ORDER[level] < threshold()) return;
	if (process.env.NODE_ENV === "test" && level !== "error") return;
	const line: Record<string, unknown> = {
		t: new Date().toISOString(),
		level,
		msg,
		svc: process.env.SERVICE_ROLE ?? "api",
		...fields,
	};
	for (const [k, v] of Object.entries(line)) {
		// Errors from mail providers can echo addresses or subjects: scrub them.
		if (v instanceof Error) line[k] = { message: scrub(v.message), stack: scrub(v.stack?.split("\n").slice(0, 6).join("\n")) };
		else if (typeof v === "string" && k !== "t") line[k] = scrub(v);
	}
	const out = JSON.stringify(line);
	if (level === "error" || level === "warn") process.stderr.write(`${out}\n`);
	else process.stdout.write(`${out}\n`);
}

/** Structured JSON logger: one line per event, easy to grep in Coolify. */
export const log = {
	debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
	info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
	warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
	error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};

/** Routes Nest's own logs through the same JSON writer. */
export class JsonLogger implements LoggerService {
	log(message: unknown, context?: string) {
		write("info", String(message), { context });
	}
	error(message: unknown, trace?: string, context?: string) {
		write("error", String(message), { context, trace });
	}
	warn(message: unknown, context?: string) {
		write("warn", String(message), { context });
	}
	debug(message: unknown, context?: string) {
		write("debug", String(message), { context });
	}
	verbose(message: unknown, context?: string) {
		write("debug", String(message), { context });
	}
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Strip email addresses from free text before it reaches a log line. */
export function scrub(text: unknown): string {
	return String(text ?? "").replace(EMAIL_RE, "[email]").slice(0, 500);
}
