# W8 — Multi-Provider Switching (iteration 2) — Design Spec

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Scope:** Wire the already-landed `ai_connection` / `ai_org_default` schema end-to-end so an org can connect **multiple** AI providers at once, pick an **org-default model**, and **switch the model per run** from the workbench. Builds directly on the `docs/multi-provider-ai.md` blueprint and reuses iteration 1's guided-wizard metadata.

## Context

Today an org has a **single** AI provider (`ai_provider_config`, one row). The read path is `getOrgAiConfig(orgId)` in `apps/web/lib/ai.ts`; advisor actions (`runAdvisor`, `runDocGen`, `runAdvisorQuestion`) resolve it via `resolveAiContext`. Settings is a single 3-step dialog (`ai-settings-dialog.tsx`, used by `bpmn-workbench.tsx` + `mermaid-workbench.tsx`) backed by `saveAiConfig` / `removeAiConfig` / `getAiConfigForSettings` / `getAiStatus` (`actions.ts`) and `listProviderModels` / `testProviderConnection` (`ai-models.ts`).

The data-model foundation already exists: `ai_connection` (one row per `(orgId, provider)`, unique-indexed) and `ai_org_default` (`organizationId` PK → `provider` + `model`) in `packages/db/src/schema/app.ts`, plus migration **`0003`** (additive create + idempotent backfill from `ai_provider_config`). `ai_provider_config` is `@deprecated` but still the live read path. Model metadata lives in `@claril/ai-advisor`: `MODEL_CATALOG`, `DEFAULT_MODELS`, `getRecommendedModelId`, `getModelInfo`, `testConnection`. Iteration 1 shipped `PROVIDER_META` (per-provider `description`/`steps`/`keyPrefix`/`keyPlaceholder`/`note`), `keyLooksValid`, and a `HowToPanel` in `ai-settings-dialog.tsx`.

## Goal

An org owner/admin connects any subset of {anthropic, openai, google, mistral, ollama} from a settings **connections manager**, sets an **org-default model**, and any user can **switch the model for the current session** from a workbench header selector — all BYOK, encrypted, strictly org-scoped, with no regression to the existing one-provider experience (existing config is backfilled).

## Design

### 0. Migration (applied up front)
Apply `0003` to **local dev DB and Neon prod** via `pnpm --filter @claril/db db:migrate` before/at the start of implementation. The embedded `ON CONFLICT … DO NOTHING` backfill copies the existing `ai_provider_config` row into `ai_connection` and seeds `ai_org_default` (keys/baseUrl/model carry over verbatim — already encrypted). The old read path keeps working until §1 lands, so prod is unaffected in the interim. The `DROP TABLE ai_provider_config` cleanup migration is **deferred** (out of scope).

### 1. Resolver — `apps/web/lib/ai.ts`
`getOrgAiConfig(orgId, opts?: { provider?: AiProvider; model?: string }) → LLMProviderConfig | null`. Resolution:
1. `opts.provider` given → load that org's `ai_connection`.
2. else → `ai_org_default` row → use its `provider`.
3. else → if exactly one **usable** connection exists, use it; otherwise `null`.
4. Build `LLMProviderConfig` from the chosen connection:
   - `model = opts.model ?? (aiOrgDefault.model when this provider is the default) ?? connection.defaultModel ?? DEFAULT_MODELS[provider]`
   - `baseUrl = connection.baseUrl ?? undefined`
   - `apiKey = connection.encryptedKey ? decryptSecret(...) : undefined`
   - usable guard unchanged (`encryptedKey || provider === 'ollama'`).

Add `listOrgConnections(orgId) → ConnectionView[]` (provider, hasKey/usable, baseUrl, defaultModel, isOrgDefault) for the UI. The legacy `ai_provider_config` reader is **deleted** once this lands (its callers — `actions.ts`, `ai-models.ts` `savedCredential` — switch to the new resolver/connection reads).

### 2. Write actions — `apps/web/lib/actions.ts` (owner/admin only, existing membership check)
- `connectAiProvider({ provider, apiKey?, baseUrl?, defaultModel? })` — upsert `ai_connection` on `(orgId, provider)`; encrypt key (reuse `crypto.ts`); default model to `DEFAULT_MODELS[provider]` when omitted. A blank `apiKey` on an existing connection keeps the stored key (mirrors current "leave blank" semantics).
- `removeAiProvider(provider)` — delete the connection; if `ai_org_default` pointed at it, repoint to another usable connection (deterministic pick) or delete the default row.
- `setOrgDefaultModel({ provider, model })` — upsert `ai_org_default`; validate `provider` is a live **usable** connection for the org.
- `testAiConnection(provider)` — server probe via `@claril/ai-advisor` `testConnection` against the stored (or just-submitted) credential; returns `{ ok, error? }`, never the key. (Generalizes the existing `testProviderConnection`.)
- Advisor actions (`runAdvisor`, `runDocGen`, `runAdvisorQuestion`) gain optional `override?: { provider?; model? }` threaded into `resolveAiContext` → `getOrgAiConfig(orgId, override)`. No override → org default → sole-connection rule. Error string stays `"No AI provider configured."` so the one-click setup CTA still triggers.

`getAiStatus` / `getAiConfigForSettings` evolve to report **all** connections + the org default (drive the settings cards + workbench selector).

### 3. Settings — connections manager (replaces the single dialog)
A **cards grid**, one card per supported provider:
- Header: provider icon + name + **status pill** (Connected / Not connected / Error from last test).
- **Connected:** model selector (from `listProviderModels` / `MODEL_CATALOG`), **Test**, **Remove**, and a "default" indicator when it's the org default.
- **Not connected:** an **Add** affordance that expands to the connect form — and this form **reuses iteration 1's guidance**: `HowToPanel` (steps + console link), `keyPlaceholder`, the soft `keyLooksValid` warning, and `note`. So the guided UX isn't discarded — it lives per-card.
- **Org default model** control at the top: one selector across every model of every **connected** provider → `setOrgDefaultModel`.
- All mutating controls disabled unless `canEdit` (owner/admin), as today.

The existing `ai-settings-dialog.tsx` is refactored into this manager. `HowToPanel` + the key-field-with-guidance become a small reusable sub-component (`ProviderConnectForm`) consumed by each card; no guided-UX regression. Entry points in `bpmn-workbench.tsx` / `mermaid-workbench.tsx` keep opening "AI settings" — now the manager.

### 4. Workbench — model selector
A compact header selector (in `top-bar.tsx`, near the AI status affordance) lists every `{provider, model}` across connected providers (grouped by provider), from `listOrgConnections` + the model catalog. Selecting an entry:
- sets a **per-session override** (held in workbench client state, passed as `override` to advisor actions for subsequent runs), and
- offers an explicit **"Set as org default"** → `setOrgDefaultModel`.

Initial selection reflects `ai_org_default`. With nothing connected, it shows a **"Connect AI"** CTA opening the settings manager.

## Components & boundaries
- `lib/ai.ts` — resolver + `listOrgConnections` (server, org-scoped, decrypts only server-side). Unit-testable with a mocked db.
- `lib/actions.ts` — the four write actions + advisor `override` threading (auth + org-scope at the boundary).
- `components/ai-settings-dialog.tsx` → connections manager + extracted `ProviderConnectForm` (reuses `HowToPanel`, `keyLooksValid`, `PROVIDER_META`).
- `components/top-bar.tsx` (+ a small `ModelSwitcher`) — per-session override + set-default.
- No new dependency. `crypto.ts`, `MODEL_CATALOG`, `DEFAULT_MODELS` reused.

## Error handling
- Resolver returns `null` (never throws) when nothing usable; callers keep the `"No AI provider configured."` contract.
- `removeAiProvider` never leaves a dangling `ai_org_default` (repoint-or-clear).
- `testAiConnection` returns `{ ok:false, error }` rather than throwing; UI shows the error pill.
- All write actions re-check membership/role; non-admins get a clear permission error and disabled controls.

## Testing
- **Unit (`ai.test.ts` or `ai-resolver.test.ts`, mocked db):** resolver precedence (explicit provider > org default > sole connection > null); model precedence chain; usable-credential guard; `removeAiProvider` repoint-vs-clear of the default.
- **Keep** `ai-providers.test.ts` (iteration 1).
- **Manual:** apply migration → existing single config still works (backfilled) → connect a 2nd provider → set org default → Test each → Remove the default and confirm it repoints → workbench selector switches the model for a run → non-admin sees disabled controls.

## Out of scope (queued)
AI Gateway routing; Google OAuth→Vertex; the `DROP TABLE ai_provider_config` cleanup migration (separate follow-up once prod backfill is verified live).

## Self-review
- Placeholders: none — all action signatures, resolver order, and reuse points are concrete.
- Consistency: keeps the `"No AI provider configured."` contract and BYOK/encryption invariants from the blueprint; reuses (doesn't discard) iteration-1 guidance.
- Scope: one cohesive end-to-end slice; Gateway/Vertex/cleanup explicitly deferred.
- Ambiguity: workbench selection is **per-session override by default**, org default only on explicit opt-in; blank key = keep existing; default repoint on remove is deterministic.
