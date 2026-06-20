/** Supported, brand-agnostic LLM providers. All BYOK. */
export type AiProvider = "anthropic" | "openai" | "google" | "mistral" | "ollama";

export interface LLMProviderConfig {
  provider: AiProvider;
  /** Model id. Defaults to a sensible model per provider when omitted. */
  model?: string;
  /** BYOK key. Optional for local providers (Ollama). */
  apiKey?: string;
  /** Base URL override (self-hosted / proxy / Ollama). */
  baseUrl?: string;
}

/** Default model per provider. Anthropic uses the latest Opus. */
export const DEFAULT_MODELS: Record<AiProvider, string | undefined> = {
  anthropic: "claude-opus-4-8",
  openai: undefined,
  google: undefined,
  mistral: undefined,
  ollama: undefined,
};
