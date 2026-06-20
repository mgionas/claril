# W8 — Guided Provider-Connect Wizard (iteration 1) — Design Spec

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Scope:** Make the existing AI-provider setup wizard genuinely *guided*. One slice; multi-provider switching, Vercel AI Gateway, and Google OAuth→Vertex are explicitly **out of scope** (queued for later W8 iterations).

## Context

`apps/web/components/ai-settings-dialog.tsx` is already a 3-step wizard (**Provider → API key → Model**) with a step indicator, `ProviderIcon`, a live `ModelPicker`, and an inline **Test** (`testProviderConnection`). It saves via `saveAiConfig` (the current single-row path — unchanged here). Per-provider copy lives in `apps/web/lib/ai-providers.ts` as `PROVIDER_META` (today: `label`, `needsKey`, `keyHint`, `keyUrl`, `keyUrlLabel`). Providers: anthropic / openai / google / mistral / ollama.

The wizard works but the "how do I actually get a key?" guidance is a single line. W8 turns that into real, per-provider step-by-step guidance with format hints — the "guided" promise.

## Goal

A first-time user picks a provider and is walked through getting and entering a valid key, with provider-specific steps, a one-click link to the right console, the expected key format, a soft format check, and a clear test result — without leaving the wizard or guessing.

## Design

### 1. Provider metadata (data) — `lib/ai-providers.ts`

Extend `ProviderMeta` (keep existing fields for back-compat) with:
- `description: string` — one line on what the provider is / when to pick it (shown on the Provider step).
- `steps: string[]` — 2–3 short, ordered "how to get a key" instructions.
- `keyPrefix?: string` — expected key prefix (e.g. `sk-ant-`, `sk-`); absent for providers without a stable prefix (Google) and for Ollama.
- `keyPlaceholder?: string` — the input placeholder showing the format (e.g. `sk-ant-…`).
- `note?: string` — optional caveat (e.g. "Requires billing enabled", "Free tier available").

Populate for all five providers. Ollama keeps `needsKey: false`; its `steps` describe running the daemon and its `keyPlaceholder` is unused (base-URL guidance already exists).

Add a pure helper:
- `keyLooksValid(provider, key): boolean` — `true` when the provider has no `keyPrefix`, the key is empty (blank = "keep existing"), or the trimmed key starts with `keyPrefix`. Drives a **soft, non-blocking** format hint only.

### 2. Guided API-key step (UI) — `ai-settings-dialog.tsx`

Replace the single `keyHint` line with a guidance panel (provider key step):
- A compact **"How to connect {label}"** block rendering `steps` as an ordered list.
- A prominent **"Open {keyUrlLabel} ↗"** button/link to `keyUrl` (the provider's key console).
- The key `Input` uses `keyPlaceholder` (falls back to the current "Leave blank to keep the existing key" when no placeholder / on edit).
- `note` shown as a subtle caveat line when present.
- A **soft** inline warning under the field when `!keyLooksValid(provider, apiKey)` (e.g. "That doesn't look like a {label} key — it usually starts with `{keyPrefix}`"). Non-blocking: the user can still proceed/test/save (handles proxies, new formats).
- Keep the existing base-URL field for ollama/openai and the existing Test button + result; surface the test result with clearer ok/error styling (reuse existing `testResult`).

### 3. Provider step polish — `ai-settings-dialog.tsx`

Under the provider `Select`, show the selected provider's `description` (one line) so the choice is informed. Keep the existing "provider-agnostic, switch any time" note.

### Out of scope (queued)
Multi-provider connect/switch (`aiConnection` + `aiOrgDefault` wiring), Vercel AI Gateway, Google OAuth→Vertex, new providers, new entry points, changing the save path.

## Components & boundaries
- `lib/ai-providers.ts` — pure presentation data + `keyLooksValid` (no secrets, no I/O). Unit-testable.
- `ai-settings-dialog.tsx` — consumes the metadata; rendering only. Manual-verified.
No schema change, no server-action change, no new dependency.

## Testing
- **Unit (`ai-providers.test.ts`):** every provider has non-empty `description` + `steps`; every key-needing provider has a `keyPlaceholder`; `keyLooksValid` — accepts blank, accepts a correct-prefix key, rejects a wrong-prefix key for a prefixed provider, accepts anything for a no-prefix provider (Google) and Ollama.
- **Manual:** open the wizard per provider → guidance steps + console link render; placeholder shows the format; a bad-prefix key shows the soft warning but still lets you Test/Save; Test + Model steps unchanged.

## Self-review
- Placeholders: none — all five providers' copy is specified in the plan.
- Consistency: no schema/save change; back-compat fields retained; soft validation never blocks (matches "BYOK, support proxies").
- Scope: single focused slice; larger W8 items explicitly queued.
- Ambiguity: format check is explicitly **soft/non-blocking**; blank key still means "keep existing".
