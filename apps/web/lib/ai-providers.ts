import type { AiProvider } from "@claril/ai-advisor";

/**
 * Client-safe provider presentation metadata: label, whether a key is needed,
 * and a "where to get a key" instruction + link for the setup wizard. No
 * secrets here — purely UI copy.
 */
export interface ProviderMeta {
  value: AiProvider;
  label: string;
  needsKey: boolean;
  /** One-line hint shown under the API key field. */
  keyHint: string;
  /** Where to obtain a key (or set up the daemon, for Ollama). */
  keyUrl: string;
  keyUrlLabel: string;
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    needsKey: true,
    keyHint: "Create a key in the Anthropic Console → API Keys.",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyUrlLabel: "console.anthropic.com",
  },
  {
    value: "openai",
    label: "OpenAI",
    needsKey: true,
    keyHint: "Create a key in the OpenAI dashboard → API keys.",
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "platform.openai.com",
  },
  {
    value: "google",
    label: "Google (Gemini)",
    needsKey: true,
    keyHint: "Generate an API key in Google AI Studio.",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyUrlLabel: "aistudio.google.com",
  },
  {
    value: "mistral",
    label: "Mistral",
    needsKey: true,
    keyHint: "Create a key in the Mistral console → API Keys.",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyUrlLabel: "console.mistral.ai",
  },
  {
    value: "ollama",
    label: "Ollama (local)",
    needsKey: false,
    keyHint: "Runs locally — no key needed. Make sure `ollama serve` is running.",
    keyUrl: "https://ollama.com/download",
    keyUrlLabel: "ollama.com",
  },
];

export function providerMeta(provider: AiProvider): ProviderMeta {
  return PROVIDER_META.find((p) => p.value === provider) ?? PROVIDER_META[0];
}
