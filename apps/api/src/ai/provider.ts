import { z } from "zod";
import { env, features } from "../config/env";
import { ApiError } from "../common/errors";

/** Host of the configured AI provider, shown on the privacy page. */
export function aiProviderName(): string | null {
	if (!features.ai()) return null;
	const host = new URL(env().AI_BASE_URL).hostname;
	if (host.includes("deepseek")) return "DeepSeek";
	if (host.includes("openai.com")) return "OpenAI";
	if (host.includes("openrouter")) return "OpenRouter";
	if (host.includes("groq")) return "Groq";
	return host;
}

function parseJsonObject(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1] : text;
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start === -1 || end === -1) throw new Error("No JSON object in AI response");
	return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * One structured call through TanStack AI (OpenAI-compatible adapter, so
 * DeepSeek by default, swappable with AI_MODEL / AI_BASE_URL). The prompt and
 * the reply are never logged; callers store only the validated result.
 */
export async function generateStructured<T extends z.ZodTypeAny>(system: string, user: string, schema: T): Promise<z.infer<T>> {
	if (!features.ai()) throw new ApiError(503, "AI is not configured yet", "ai_unconfigured");
	const e = env();
	// ESM-only packages: load at runtime from this CommonJS build.
	const { chat } = await import("@tanstack/ai");
	const { createOpenaiChatCompletions } = await import("@tanstack/ai-openai");
	const adapter = createOpenaiChatCompletions(
		e.AI_MODEL as Parameters<typeof createOpenaiChatCompletions>[0],
		e.AI_API_KEY as string,
		{ baseURL: e.AI_BASE_URL },
	);
	const sys = `${system}\n\nRespond with ONLY a single JSON object that satisfies this JSON Schema. No prose, no markdown fences.\nJSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;
	// Ask OpenAI not to retain the exchange; other providers ignore unknown options.
	const noRetain = new URL(e.AI_BASE_URL).hostname.endsWith("openai.com") ? { modelOptions: { store: false } } : {};
	const text = (await chat({
		adapter,
		systemPrompts: [sys],
		messages: [{ role: "user", content: user }],
		stream: false,
		...(noRetain as object),
	} as Parameters<typeof chat>[0])) as unknown as string;
	return schema.parse(parseJsonObject(text));
}
