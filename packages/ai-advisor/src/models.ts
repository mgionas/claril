import type { AiProvider } from "./types";

/**
 * Curated, provider-keyed model catalog used to ANNOTATE the model picker
 * (pricing, context window, capabilities) and to supply a sensible default per
 * provider so users never have to type a model id.
 *
 * NOTE: prices and ids are APPROXIMATE and updated periodically — they are a UX
 * aid, not a billing source of truth. Always honor the user's configured model.
 * Live ids fetched from each provider's models endpoint take precedence at
 * runtime; ids missing from this catalog are still selectable (no pricing info).
 * Anthropic ids/prices reflect the `claude-api` skill catalog as of 2026-06.
 * Prices are USD per 1,000,000 tokens.
 */
export type ModelCapability =
  | "reasoning"
  | "vision"
  | "tools"
  | "structured-output"
  | "long-context"
  | "fast"
  | "cheap"
  | "local";

export interface ModelInfo {
  /** Provider model id passed to the SDK (e.g. "claude-opus-4-8"). */
  id: string;
  /** Human label for the picker. */
  label: string;
  /** Max input tokens, when known. */
  contextWindow?: number;
  /** USD per 1M input tokens, when known. */
  inputPricePer1M?: number;
  /** USD per 1M output tokens, when known. */
  outputPricePer1M?: number;
  capabilities: ModelCapability[];
  /** Exactly one per provider should be the recommended default. */
  recommended?: boolean;
}

export const MODEL_CATALOG: Record<AiProvider, ModelInfo[]> = {
  anthropic: [
    {
      id: "claude-opus-4-8",
      label: "Claude Opus 4.8",
      contextWindow: 1_000_000,
      inputPricePer1M: 5,
      outputPricePer1M: 25,
      capabilities: ["reasoning", "vision", "tools", "structured-output", "long-context"],
      recommended: true,
    },
    {
      id: "claude-opus-4-7",
      label: "Claude Opus 4.7",
      contextWindow: 1_000_000,
      inputPricePer1M: 5,
      outputPricePer1M: 25,
      capabilities: ["reasoning", "vision", "tools", "structured-output", "long-context"],
    },
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      contextWindow: 1_000_000,
      inputPricePer1M: 3,
      outputPricePer1M: 15,
      capabilities: ["reasoning", "vision", "tools", "structured-output", "long-context"],
    },
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      contextWindow: 200_000,
      inputPricePer1M: 1,
      outputPricePer1M: 5,
      capabilities: ["tools", "structured-output", "fast", "cheap"],
    },
  ],
  openai: [
    {
      id: "gpt-5.1",
      label: "GPT-5.1",
      contextWindow: 400_000,
      inputPricePer1M: 1.25,
      outputPricePer1M: 10,
      capabilities: ["reasoning", "vision", "tools", "structured-output", "long-context"],
      recommended: true,
    },
    {
      id: "gpt-5.1-mini",
      label: "GPT-5.1 mini",
      contextWindow: 400_000,
      inputPricePer1M: 0.25,
      outputPricePer1M: 2,
      capabilities: ["tools", "structured-output", "fast", "cheap"],
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      contextWindow: 1_000_000,
      inputPricePer1M: 2,
      outputPricePer1M: 8,
      capabilities: ["vision", "tools", "structured-output", "long-context"],
    },
    {
      id: "o4-mini",
      label: "o4-mini (reasoning)",
      contextWindow: 200_000,
      inputPricePer1M: 1.1,
      outputPricePer1M: 4.4,
      capabilities: ["reasoning", "tools", "structured-output", "cheap"],
    },
  ],
  google: [
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      contextWindow: 1_000_000,
      inputPricePer1M: 1.25,
      outputPricePer1M: 10,
      capabilities: ["reasoning", "vision", "tools", "structured-output", "long-context"],
      recommended: true,
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      contextWindow: 1_000_000,
      inputPricePer1M: 0.3,
      outputPricePer1M: 2.5,
      capabilities: ["vision", "tools", "structured-output", "long-context", "fast", "cheap"],
    },
    {
      id: "gemini-2.0-flash",
      label: "Gemini 2.0 Flash",
      contextWindow: 1_000_000,
      inputPricePer1M: 0.1,
      outputPricePer1M: 0.4,
      capabilities: ["vision", "tools", "long-context", "fast", "cheap"],
    },
  ],
  mistral: [
    {
      id: "mistral-large-latest",
      label: "Mistral Large",
      contextWindow: 128_000,
      inputPricePer1M: 2,
      outputPricePer1M: 6,
      capabilities: ["reasoning", "tools", "structured-output", "long-context"],
      recommended: true,
    },
    {
      id: "mistral-medium-latest",
      label: "Mistral Medium",
      contextWindow: 128_000,
      inputPricePer1M: 0.4,
      outputPricePer1M: 2,
      capabilities: ["tools", "structured-output", "long-context"],
    },
    {
      id: "mistral-small-latest",
      label: "Mistral Small",
      contextWindow: 128_000,
      inputPricePer1M: 0.1,
      outputPricePer1M: 0.3,
      capabilities: ["tools", "fast", "cheap"],
    },
  ],
  // Ollama is local + BYO-model — no fixed catalog or pricing. The picker is
  // populated live from the running daemon; these are common defaults/hints.
  ollama: [
    {
      id: "llama3.1",
      label: "Llama 3.1 (local)",
      capabilities: ["tools", "local"],
      recommended: true,
    },
    {
      id: "qwen2.5",
      label: "Qwen 2.5 (local)",
      capabilities: ["tools", "local"],
    },
    {
      id: "mistral",
      label: "Mistral (local)",
      capabilities: ["local"],
    },
  ],
};

/**
 * The recommended (default) model id for a provider. Falls back to the first
 * catalog entry. Used to seed DEFAULT_MODELS and the picker preselection.
 */
export function getRecommendedModelId(provider: AiProvider): string | undefined {
  const list = MODEL_CATALOG[provider];
  if (!list || list.length === 0) return undefined;
  return (list.find((m) => m.recommended) ?? list[0]).id;
}

/** Catalog metadata for a given id, if known. */
export function getModelInfo(provider: AiProvider, id: string): ModelInfo | undefined {
  return MODEL_CATALOG[provider]?.find((m) => m.id === id);
}
