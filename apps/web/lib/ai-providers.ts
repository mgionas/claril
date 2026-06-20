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
  /** One-line description shown on the Provider step. */
  description: string;
  /** One-line hint shown under the API key field (kept for back-compat). */
  keyHint: string;
  /** 2–3 ordered "how to get a key" steps. */
  steps: string[];
  /** Where to obtain a key (or set up the daemon, for Ollama). */
  keyUrl: string;
  keyUrlLabel: string;
  /** Expected key prefix, when stable (drives a soft format hint). */
  keyPrefix?: string;
  /** Input placeholder showing the key format. */
  keyPlaceholder?: string;
  /** Optional caveat (billing, free tier, etc.). */
  note?: string;
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    needsKey: true,
    description: "Claude models — strong reasoning; a great default for diagram reasoning + editing.",
    keyHint: "Create a key in the Anthropic Console → API Keys.",
    steps: [
      "Sign in at console.anthropic.com.",
      "Open Settings → API Keys and click Create Key.",
      "Copy the key (starts with sk-ant-) and paste it below.",
    ],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyUrlLabel: "console.anthropic.com",
    keyPrefix: "sk-ant-",
    keyPlaceholder: "sk-ant-…",
    note: "Requires a small prepaid balance or billing enabled.",
  },
  {
    value: "openai",
    label: "OpenAI",
    needsKey: true,
    description: "GPT models — broad capability; works with OpenAI-compatible proxies via Base URL.",
    keyHint: "Create a key in the OpenAI dashboard → API keys.",
    steps: [
      "Sign in at platform.openai.com.",
      "Open API keys → Create new secret key.",
      "Copy the key (starts with sk-) and paste it below.",
    ],
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "platform.openai.com",
    keyPrefix: "sk-",
    keyPlaceholder: "sk-…",
    note: "Requires billing enabled on your OpenAI account.",
  },
  {
    value: "google",
    label: "Google (Gemini)",
    needsKey: true,
    description: "Gemini models — generous free tier; good for getting started at no cost.",
    keyHint: "Generate an API key in Google AI Studio.",
    steps: [
      "Sign in at aistudio.google.com.",
      "Open Get API key → Create API key.",
      "Copy the key and paste it below.",
    ],
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyUrlLabel: "aistudio.google.com",
    keyPlaceholder: "AIza…",
    note: "Free tier available; no billing required to start.",
  },
  {
    value: "mistral",
    label: "Mistral",
    needsKey: true,
    description: "Mistral models — fast, cost-efficient European option.",
    keyHint: "Create a key in the Mistral console → API Keys.",
    steps: [
      "Sign in at console.mistral.ai.",
      "Open API Keys → Create new key.",
      "Copy the key and paste it below.",
    ],
    keyUrl: "https://console.mistral.ai/api-keys",
    keyUrlLabel: "console.mistral.ai",
    keyPlaceholder: "your Mistral API key",
  },
  {
    value: "ollama",
    label: "Ollama (local)",
    needsKey: false,
    description: "Run open models locally — no key, no cloud; needs Ollama running on your machine.",
    keyHint: "Runs locally — no key needed. Make sure `ollama serve` is running.",
    steps: [
      "Install Ollama from ollama.com/download.",
      "Pull a model, e.g. `ollama pull llama3.1`.",
      "Ensure `ollama serve` is running (default http://localhost:11434).",
    ],
    keyUrl: "https://ollama.com/download",
    keyUrlLabel: "ollama.com",
  },
];

export function providerMeta(provider: AiProvider): ProviderMeta {
  return PROVIDER_META.find((p) => p.value === provider) ?? PROVIDER_META[0];
}

/**
 * Soft check that a pasted key matches the provider's expected format. A blank
 * key (means "keep existing") and providers without a stable prefix always pass.
 * Non-blocking — only drives a hint; users can still test/save (proxies, new formats).
 */
export function keyLooksValid(provider: AiProvider, key: string): boolean {
  const trimmed = key.trim();
  if (trimmed === "") return true;
  const meta = providerMeta(provider);
  if (!meta.keyPrefix) return true;
  return trimmed.startsWith(meta.keyPrefix);
}
