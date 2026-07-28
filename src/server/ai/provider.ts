import { chat, convertSchemaToJsonSchema } from "@tanstack/ai";
import { createOpenaiChatCompletions } from "@tanstack/ai-openai";
import type { z } from "zod";
import { serverEnv } from "@/env.server";
import { ApiError } from "@/server/lib/http";

/**
 * Swappable AI provider (PRD §8.3). DeepSeek by default via its
 * OpenAI-compatible `/chat/completions` endpoint; change AI_MODEL / AI_BASE_URL
 * for any other OpenAI-compatible provider without touching call sites.
 */
export function isAiConfigured(): boolean {
	return Boolean(serverEnv.AI_API_KEY);
}

function adapter() {
	if (!serverEnv.AI_API_KEY) {
		throw new ApiError(503, "AI is not configured", "ai_unconfigured");
	}
	// The model name is free-form for compatible providers (e.g. deepseek-chat);
	// cast past the OpenAI model-name union.
	return createOpenaiChatCompletions(
		serverEnv.AI_MODEL as Parameters<typeof createOpenaiChatCompletions>[0],
		serverEnv.AI_API_KEY,
		{ baseURL: serverEnv.AI_BASE_URL },
	);
}

/** Pull a JSON object out of a model response (tolerates ``` fences / prose). */
function parseJsonObject(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1] : text;
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start === -1 || end === -1) {
		throw new Error("No JSON object in AI response");
	}
	return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * One-shot structured generation: system + user prompt → Zod-validated object.
 * Non-streaming. Uses prompt-embedded JSON Schema + local parse/validate so it
 * works on any OpenAI-compatible provider (no json_schema dependency).
 */
export async function generateStructured<T extends z.ZodTypeAny>(
	system: string,
	user: string,
	schema: T,
): Promise<z.infer<T>> {
	const jsonSchema = convertSchemaToJsonSchema(schema);
	const sys = `${system}

Respond with ONLY a single JSON object that satisfies this JSON Schema. No prose, no markdown fences.
JSON Schema:
${JSON.stringify(jsonSchema)}`;

	const text = (await chat({
		adapter: adapter(),
		systemPrompts: [sys],
		messages: [{ role: "user", content: user }],
		stream: false,
	})) as string;

	return schema.parse(parseJsonObject(text));
}
