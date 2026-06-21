/** Supported, brand-agnostic LLM providers. All BYOK. */
export type AiProvider = "anthropic" | "openai" | "google" | "mistral" | "ollama" | "openrouter";

export interface LLMProviderConfig {
  provider: AiProvider;
  /** Model id. Defaults to a sensible model per provider when omitted. */
  model?: string;
  /** BYOK key. Optional for local providers (Ollama). */
  apiKey?: string;
  /** Base URL override (self-hosted / proxy / Ollama). */
  baseUrl?: string;
}

/**
 * Default (recommended) model per provider. Every provider has a real default
 * so resolving a config never throws "model id required" — these mirror the
 * `recommended` entries in the model catalog (see `./models`). Anthropic uses
 * the latest Opus.
 */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-5.1",
  google: "gemini-2.5-pro",
  mistral: "mistral-large-latest",
  ollama: "llama3.1",
  openrouter: "openrouter/auto",
};
