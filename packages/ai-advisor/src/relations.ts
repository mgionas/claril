import { generateText, type LanguageModelUsage } from "ai";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";

const RELATIONS_SYSTEM_PROMPT =
  "You are Claril's architecture-memory assistant. You remind architects of real cross-diagram connections between their models. Narrate only the relationships you are given; never invent connections.";

/**
 * Narrate the deterministic cross-diagram relations (grounded on the Asset
 * Catalog bindings) as a short reminder for the architect. Provider-agnostic:
 * the model is built from BYOK config. The prompt is built by the caller
 * (pure `buildRelationsPrompt` in `apps/web/lib/related.ts`) so this module
 * stays a thin LLM call, mirroring {@link generateProcessDocWithUsage}.
 */
export async function summarizeRelationsWithUsage(
  input: { prompt: string },
  config: LLMProviderConfig,
): Promise<{ value: string; usage: LanguageModelUsage }> {
  const { text, usage } = await generateText({
    model: createModel(config),
    system: RELATIONS_SYSTEM_PROMPT,
    prompt: input.prompt,
  });
  return { value: text.trim(), usage };
}
