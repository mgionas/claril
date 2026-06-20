# W8 — Guided Provider-Connect Wizard (iteration 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the existing 3-step AI-provider wizard into a *guided* one — per-provider step-by-step instructions, a key-format placeholder + soft format check, and a one-line provider description.

**Architecture:** Pure presentation data in `lib/ai-providers.ts` (extended `ProviderMeta` + a `keyLooksValid` helper) consumed by `ai-settings-dialog.tsx`. No schema, server-action, save-path, or dependency changes.

**Spec:** `docs/superpowers/specs/2026-06-21-w8-guided-provider-connect-design.md`.

---

### Task 1: Provider metadata + `keyLooksValid` (data + unit tests)

**Files:** `apps/web/lib/ai-providers.ts`, `apps/web/lib/ai-providers.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/ai-providers.test.ts`:
```tsx
import { describe, expect, it } from "vitest";
import { PROVIDER_META, providerMeta, keyLooksValid } from "./ai-providers";

describe("PROVIDER_META", () => {
  it("every provider has a description and steps", () => {
    for (const p of PROVIDER_META) {
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThan(0);
    }
  });
  it("every key-needing provider has a key placeholder", () => {
    for (const p of PROVIDER_META) {
      if (p.needsKey) expect(p.keyPlaceholder && p.keyPlaceholder.length > 0).toBe(true);
    }
  });
});

describe("keyLooksValid", () => {
  it("accepts a blank key (means: keep existing)", () => {
    expect(keyLooksValid("anthropic", "")).toBe(true);
    expect(keyLooksValid("anthropic", "   ")).toBe(true);
  });
  it("accepts a correct-prefix key and rejects a wrong-prefix one", () => {
    expect(keyLooksValid("anthropic", "sk-ant-abc123")).toBe(true);
    expect(keyLooksValid("anthropic", "sk-abc123")).toBe(false);
  });
  it("accepts any non-empty key for a provider without a stable prefix", () => {
    expect(keyLooksValid("google", "AIzaSyWhatever")).toBe(true);
  });
  it("accepts anything for ollama (no key needed)", () => {
    expect(keyLooksValid("ollama", "anything")).toBe(true);
    expect(keyLooksValid("ollama", "")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it; confirm FAIL**

Run: `cd apps/web && pnpm exec vitest run lib/ai-providers.test.ts`
Expected: FAIL — `keyLooksValid` not exported / `description`/`steps`/`keyPlaceholder` missing.

- [ ] **Step 3: Extend `ProviderMeta` + populate + add `keyLooksValid`**

In `apps/web/lib/ai-providers.ts`, extend the interface (keep existing fields):
```tsx
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
```
Replace `PROVIDER_META` with the populated entries:
```tsx
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
```
Keep `providerMeta(provider)` as-is. Add:
```tsx
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
```

- [ ] **Step 4: Run the test; confirm PASS.**

Run: `cd apps/web && pnpm exec vitest run lib/ai-providers.test.ts` → PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter web typecheck` → PASS.
```bash
git add apps/web/lib/ai-providers.ts apps/web/lib/ai-providers.test.ts
git commit -m "$(cat <<'EOF'
feat(web): richer provider metadata + soft key-format check (W8)

ProviderMeta gains description/steps/keyPrefix/keyPlaceholder/note for all
providers; keyLooksValid does a non-blocking key-format check. Unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Guided wizard UI

**Files:** `apps/web/components/ai-settings-dialog.tsx`

- [ ] **Step 1: Provider step — show the description**

Import `keyLooksValid` alongside `PROVIDER_META, providerMeta`. In `step === 0`, replace the existing trailing `<p>` ("Provider-agnostic…") with the provider description + the agnostic note:
```tsx
              <p className="mt-1 text-[11px] text-fg-muted">{meta.description}</p>
              <p className="text-[11px] text-fg-subtle">
                Provider-agnostic. Switch any time — keys are stored per provider, encrypted.
              </p>
```

- [ ] **Step 2: Key step — guided panel + placeholder + soft warning**

Replace the `step === 1` key block (the `meta.needsKey ? (...) : (...)` part) with the guided version:
```tsx
              {meta.needsKey ? (
                <div className="flex flex-col gap-2">
                  {/* How-to guidance */}
                  <div className="rounded-[8px] border border-hairline bg-elevated/40 p-3">
                    <p className="mb-1.5 text-[11px] font-medium text-fg-muted">
                      How to connect {meta.label}
                    </p>
                    <ol className="flex list-decimal flex-col gap-1 pl-4 text-[11px] text-fg-subtle">
                      {meta.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    <a
                      href={meta.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                    >
                      Open {meta.keyUrlLabel} ↗
                    </a>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-fg-muted" htmlFor="api-key">
                      API key
                    </Label>
                    <Input
                      id="api-key"
                      type="password"
                      className="bg-elevated"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={meta.keyPlaceholder ?? "Leave blank to keep the existing key"}
                      autoComplete="off"
                      autoFocus
                    />
                    {!keyLooksValid(provider, apiKey) && (
                      <p className="text-[11px] text-warning">
                        That doesn't look like a {meta.label} key — it usually starts with{" "}
                        <code className="font-mono">{meta.keyPrefix}</code>. You can still continue.
                      </p>
                    )}
                    {meta.note && <p className="text-[11px] text-fg-subtle">{meta.note}</p>}
                  </div>
                </div>
              ) : (
                <div className="rounded-[8px] border border-hairline bg-elevated/40 p-3">
                  <p className="mb-1.5 text-[11px] font-medium text-fg-muted">
                    How to run {meta.label}
                  </p>
                  <ol className="flex list-decimal flex-col gap-1 pl-4 text-[11px] text-fg-subtle">
                    {meta.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <a
                    href={meta.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                  >
                    Open {meta.keyUrlLabel} ↗
                  </a>
                </div>
              )}
```
Leave the base-URL block (ollama/openai) and the Model step / Test button exactly as they are.
> `warning` token + `font-mono` are existing design-system classes. `code` styling is fine inline.

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter web typecheck` → PASS.
Run: `pnpm --filter web build` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ai-settings-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(web): guided AI provider wizard — per-provider steps + format hint (W8)

Key step shows how-to steps + console link + format placeholder and a soft
"doesn't look like a {provider} key" warning; provider step shows a one-line
description. Uses the extended PROVIDER_META; no save/schema change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Manual verification

**Files:** none (runtime).

- [ ] **Step 1: Restart `pnpm dev`**, open AI settings (top-bar "AI: off" or `/settings/ai` entry → dialog), and for each provider:
1. **Provider step** shows the one-line description.
2. **Key step** shows numbered how-to steps, an "Open {console} ↗" link, and a format placeholder (`sk-ant-…`, `sk-…`, `AIza…`).
3. Paste a wrong-prefix key (e.g. `sk-foo` for Anthropic) → soft warning appears; Test + Next still work.
4. **Ollama** shows the run-locally steps + base-URL field, no key input.
5. Test + Model steps behave as before; saving still works.

Expected: guided, clear, non-blocking. Note any deviation.

---

## Self-Review
- Spec coverage: metadata (Task 1), guided key step + soft warning (Task 2 Step 2), provider description (Task 2 Step 1), `keyLooksValid` non-blocking (Task 1). ✓
- No schema/server-action/save change; back-compat `ProviderMeta` fields retained. ✓
- TDD for the pure helper/data (Task 1); UI manual-verified (Task 3). ✓
- Type consistency: `keyLooksValid(provider, key)` signature used identically in test + dialog; `ProviderMeta` new optional fields don't break existing readers. ✓
- Out of scope (multi-provider, Gateway, Vertex) untouched. ✓
