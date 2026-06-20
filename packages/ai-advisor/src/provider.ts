import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { DEFAULT_MODELS, type LLMProviderConfig } from "./types";

/**
 * Resolve a brand-agnostic Vercel AI SDK model from a BYOK config. The whole
 * point of routing through the AI SDK is that Claril is provider-neutral — the
 * caller picks the provider; this is the only place provider specifics live.
 */
export function createModel(config: LLMProviderConfig): LanguageModel {
  const model = config.model ?? DEFAULT_MODELS[config.provider];
  if (!model) {
    throw new Error(`A model id is required for provider "${config.provider}".`);
  }

  switch (config.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(model);
    case "mistral":
      return createMistral({ apiKey: config.apiKey })(model);
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        baseURL: config.baseUrl ?? "http://localhost:11434/v1",
        apiKey: config.apiKey ?? "ollama",
      })(model);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unsupported provider: ${String(exhaustive)}`);
    }
  }
}
