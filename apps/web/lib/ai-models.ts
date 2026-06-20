"use server";

import { headers } from "next/headers";
import {
  MODEL_CATALOG,
  getModelInfo,
  testConnection,
  type AiProvider,
  type ModelInfo,
} from "@claril/ai-advisor";
import { auth } from "@/lib/auth";
import { getOrgAiConfig, getUserOrgId } from "@/lib/ai";

/**
 * Fall back to the org's already-saved (decrypted) credential when the caller
 * didn't pass one — e.g. testing/refreshing on the settings page where the key
 * field is intentionally blank because a key is already stored. Server-only;
 * the key is never returned to the client.
 */
async function savedCredential(
  provider: AiProvider,
): Promise<{ apiKey?: string; baseUrl?: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return {};
    const orgId = await getUserOrgId(userId);
    if (!orgId) return {};
    const cfg = await getOrgAiConfig(orgId);
    if (cfg && cfg.provider === provider) return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl };
    return {};
  } catch {
    return {};
  }
}

/**
 * A model option for the picker: a known catalog id carries full metadata; a
 * live id not in the catalog is still selectable but flagged `unknownPricing`.
 */
export interface ProviderModelOption {
  id: string;
  label: string;
  contextWindow?: number;
  inputPricePer1M?: number;
  outputPricePer1M?: number;
  capabilities: string[];
  recommended?: boolean;
  /** True when this id isn't in our curated catalog (no pricing/capability data). */
  unknownPricing: boolean;
}

export interface ListProviderModelsResult {
  models: ProviderModelOption[];
  /** "live" = fetched from the provider; "catalog" = fell back to curated list. */
  source: "live" | "catalog";
  /** Friendly note surfaced in the UI when the live fetch failed. */
  notice?: string;
}

const catalogOption = (m: ModelInfo): ProviderModelOption => ({
  id: m.id,
  label: m.label,
  contextWindow: m.contextWindow,
  inputPricePer1M: m.inputPricePer1M,
  outputPricePer1M: m.outputPricePer1M,
  capabilities: m.capabilities,
  recommended: m.recommended,
  unknownPricing: m.inputPricePer1M === undefined && m.outputPricePer1M === undefined,
});

function catalogResult(provider: AiProvider, notice?: string): ListProviderModelsResult {
  return {
    models: (MODEL_CATALOG[provider] ?? []).map(catalogOption),
    source: "catalog",
    notice,
  };
}

/**
 * Merge live ids with curated metadata. Live ids that match the catalog inherit
 * its pricing/capabilities; unknown ids are appended as selectable but
 * unpriced. Recommended catalog entries keep their flag and float to the top.
 */
function mergeLive(provider: AiProvider, liveIds: string[]): ProviderModelOption[] {
  const catalog = MODEL_CATALOG[provider] ?? [];
  const seen = new Set<string>();
  const out: ProviderModelOption[] = [];

  for (const id of liveIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const info = getModelInfo(provider, id);
    out.push(
      info
        ? catalogOption(info)
        : { id, label: id, capabilities: [], unknownPricing: true },
    );
  }

  // Ensure the recommended catalog default is always offered even if the live
  // endpoint omits or renames it (keeps a sensible preselection).
  for (const m of catalog) {
    if (m.recommended && !seen.has(m.id)) {
      seen.add(m.id);
      out.unshift(catalogOption(m));
    }
  }

  out.sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  return out;
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Provider responded ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Chat models only: drop embeddings / moderation / tts / image / whisper ids. */
function isChatModel(id: string): boolean {
  return !/embed|moderation|whisper|tts|dall-e|image|vision-only|rerank|guard/i.test(id);
}

/**
 * Fetch the chat-capable model ids a provider exposes for the given key. Runs
 * server-side only — the key is never returned to the client. On any failure
 * (bad key, network, timeout) we fall back to the curated catalog with a
 * friendly notice so the picker is never empty. Provider-agnostic + BYOK.
 */
export async function listProviderModels(
  provider: AiProvider,
  apiKey?: string,
  baseUrl?: string,
): Promise<ListProviderModelsResult> {
  // Fall back to the saved key/baseUrl when the form didn't supply one (e.g.
  // refreshing on the settings page where the key field is blank by design).
  if (!apiKey || !baseUrl) {
    const saved = await savedCredential(provider);
    apiKey = apiKey || saved.apiKey;
    baseUrl = baseUrl || saved.baseUrl;
  }

  // Cloud providers need a key to query the live endpoint; without one, serve
  // the curated catalog (no notice — this is the expected first-run state).
  const needsKey = provider !== "ollama";
  if (needsKey && !apiKey) {
    return catalogResult(provider);
  }

  try {
    let ids: string[] = [];

    switch (provider) {
      case "anthropic": {
        const json = (await fetchJson("https://api.anthropic.com/v1/models?limit=100", {
          headers: {
            "x-api-key": apiKey!,
            "anthropic-version": "2023-06-01",
          },
        })) as { data?: { id: string }[] };
        ids = (json.data ?? []).map((m) => m.id);
        break;
      }
      case "openai": {
        const base = (baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
        const json = (await fetchJson(`${base}/models`, {
          headers: { authorization: `Bearer ${apiKey!}` },
        })) as { data?: { id: string }[] };
        ids = (json.data ?? []).map((m) => m.id).filter((id) => /gpt|o\d/i.test(id));
        break;
      }
      case "google": {
        const json = (await fetchJson(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey!)}&pageSize=200`,
          {},
        )) as {
          models?: { name: string; supportedGenerationMethods?: string[] }[];
        };
        ids = (json.models ?? [])
          .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
          .map((m) => m.name.replace(/^models\//, ""))
          .filter((id) => /gemini/i.test(id));
        break;
      }
      case "mistral": {
        const base = (baseUrl ?? "https://api.mistral.ai/v1").replace(/\/$/, "");
        const json = (await fetchJson(`${base}/models`, {
          headers: { authorization: `Bearer ${apiKey!}` },
        })) as { data?: { id: string }[] };
        ids = (json.data ?? []).map((m) => m.id);
        break;
      }
      case "ollama": {
        // Ollama's OpenAI-compatible endpoint lives at {baseUrl}/models.
        const base = (baseUrl ?? "http://localhost:11434/v1").replace(/\/$/, "");
        const json = (await fetchJson(`${base}/models`, {})) as {
          data?: { id: string }[];
        };
        ids = (json.data ?? []).map((m) => m.id);
        break;
      }
    }

    ids = ids.filter(isChatModel);
    if (ids.length === 0) {
      return catalogResult(provider, "No chat models returned — showing the built-in list.");
    }
    return { models: mergeLive(provider, ids), source: "live" };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "the request timed out"
        : "the key or endpoint could not be reached";
    return catalogResult(
      provider,
      `Couldn't fetch live models (${reason}) — showing the built-in list.`,
    );
  }
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * Optional pre-save smoke test: issue a tiny generation through the same
 * provider abstraction the app uses. Runs server-side; the key is never echoed
 * back. Returns a friendly ok/error message for the wizard.
 */
export async function testProviderConnection(
  provider: AiProvider,
  model: string,
  apiKey?: string,
  baseUrl?: string,
): Promise<TestConnectionResult> {
  // Fall back to the saved credential when the key field is blank (a key is
  // already stored) — so "Test connection" works on the settings page.
  if (!apiKey || !baseUrl) {
    const saved = await savedCredential(provider);
    apiKey = apiKey || saved.apiKey;
    baseUrl = baseUrl || saved.baseUrl;
  }
  if (provider !== "ollama" && !apiKey) {
    return { ok: false, message: "Enter an API key first." };
  }
  // Runs through the shared provider abstraction; the key never leaves the server.
  return testConnection({ provider, model, apiKey, baseUrl });
}
