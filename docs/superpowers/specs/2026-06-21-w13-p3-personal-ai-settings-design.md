# W13 — Phase 3: Personal AI Settings — Design Spec

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Builds on:** W13 P1 (user-scoped AI tables + `getUserAiConfig`/`listUserConnections`), P2 (active/per-diagram context; personal AI resolves but is **off** with no UI to add keys), W8 (org AI connections-manager).
**Goal:** Give a user a settings UI to connect their **own** BYOK AI providers (personal scope), turning personal AI on. Reuse the org connections-manager via a `scope` prop.

## Current state (verified)
- **Backend ready:** `user_ai_connection`/`user_ai_default` tables; `getUserAiConfig(userId, opts?)`, `listUserConnections(userId)` (`lib/ai.ts`); pure `resolveConnection`/`repointDefault` (unit-tested). The P1/P2 resolver already routes personal diagrams/chat to `getUserAiConfig` — so the only gap is the **config-entry UI + write actions**.
- **Org side (to mirror):** `connectAiProvider`/`removeAiProvider`/`setOrgDefaultModel`/`getAiSettings` (`actions.ts`, gated by `requireOrgAdmin`/`requireUserId`); `AiSettingsView = { canEdit, connections: ConnectionView[], orgDefault? }`.
- **Manager:** `AiConnectionsManager` (`components/ai/ai-connections-manager.tsx`) hard-imports the **org** actions; props `{ initialProvider? }`; sub-components call `connectAiProvider`/`removeAiProvider`/`testProviderConnection` directly; reads `data.orgDefault`.
- **Test:** `testProviderConnection(provider, model, apiKey?, baseUrl?)` (`ai-models.ts`); its blank-key fallback `savedCredential` resolves the **first org** via `getOrgAiConfig` — NOT active-context aware.
- **`/settings/ai` page:** uses `getUserOrgId` (first org), always renders the **org** manager + org `UsageSummary` — wrong in personal scope.

## Design

### 1. User-scoped write actions (`actions.ts`)
Mirror the org actions on `user_ai_connection`/`user_ai_default`, keyed by the session user (`requireUserId`, **no admin gate** — own keys). Reuse `encryptSecret`, `DEFAULT_MODELS`, and the pure `repointDefault`:
- `connectUserAiProvider({ provider, apiKey?, baseUrl?, defaultModel? })` — upsert on `(userId, provider)`; blank key keeps existing; default-model fallback.
- `removeUserAiProvider(provider)` — delete; if `user_ai_default` pointed at it, repoint via `repointDefault` or clear.
- `setUserDefaultModel({ provider, model })` — validate a usable user connection; upsert `user_ai_default`.
- `getUserAiSettings(): AiSettingsView` — `{ canEdit: true, connections: listUserConnections(userId), orgDefault: <user default> }`. **Reuses the `AiSettingsView` shape**; the `orgDefault` field carries the *scope* default (the manager reads it generically; UI labels it "Default model" in personal). No rename of `AiSettingsView` to avoid churn.

### 2. Scope-aware stored-credential test (`ai-models.ts`)
Change `savedCredential(provider)` to resolve via the **active context** rather than the first org: `getActiveContext()` → `getAiConfig(ctx, { provider })`. This makes a personal "Test" of a *stored* key resolve the user's key, and an org test resolve the active org's — automatically, no scope param needed. (Submitted-key tests already work.)

### 3. Manager `scope` prop (`ai-connections-manager.tsx`)
Add `scope?: "personal" | "org"` (default `"org"`). The manager selects an action set by scope:
- `personal` → `getUserAiSettings` / `connectUserAiProvider` / `removeUserAiProvider` / `setUserDefaultModel`.
- `org` → the existing four.
Thread `scope` (or the resolved connect/remove actions) into the `ProviderDetail` sub-component (which performs connect/remove). `testProviderConnection` needs no scope (server resolves active context per #2). Adapt labels by scope: the default `Select` label "Default model" (personal) vs "Organization default" (org); connect-form copy "stored for your account, encrypted" vs "per organization". All tiles/connect-form/test UI unchanged.

### 4. Context-aware `/settings/ai` (`app/settings/ai/page.tsx`)
Resolve `getActiveContext()`:
- **org** → `SettingsHeader` (org copy) + `<AiConnectionsManager scope="org" />` + `UsageSummary` for the **active** org (`getUsageSummary(ctx.orgId)` — also fixes the first-org bug).
- **personal** → `SettingsHeader` (personal copy: "your own keys, encrypted; used for your personal diagrams") + `<AiConnectionsManager scope="personal" />` + **no usage panel** (AI usage is org-metered only) — instead a one-line muted note ("Usage is tracked per organization."). 

### 5. Workbench AI-settings dialog scope (`ai-settings-dialog.tsx` + workbench)
The dialog also renders `<AiConnectionsManager />` (default org). Opened from a **personal** diagram's workbench it must manage **personal** AI. Add a `scope?: "personal" | "org"` prop to `AiSettingsDialog`, passed to the manager. The workbench supplies it from the open diagram's context: `d/[diagramId]/page.tsx` already derives the diagram's context for the `aiConnected` gate — pass that scope (`"personal" | "org"`) down to the workbench → dialog. So a personal diagram's "AI settings" manages personal keys; an org diagram's manages the org's. Default `"org"` keeps any other caller unchanged.

### 6. Effect
Adding a personal key → `getUserAiConfig` resolves → the existing resolver turns personal chat/advisor on for personal diagrams. No resolver changes.

## Components & boundaries
- `actions.ts` — 4 user-scoped actions (mirror org; reuse `repointDefault`/`encryptSecret`/`DEFAULT_MODELS`).
- `ai-models.ts` — `savedCredential` → active-context resolution.
- `ai-connections-manager.tsx` — `scope` prop + action-set selection + label adaptation; thread scope to `ProviderDetail`.
- `app/settings/ai/page.tsx` — context branch.
- No schema change; no resolver change; reuses `ConnectionView`/`AiSettingsView`/`ProviderConnectForm`.

## Testing
- Pure `resolveConnection`/`repointDefault` already unit-tested (the user path reuses them).
- New write actions are DB CRUD — manual-verified (same standard as the org actions).
- Manual: in **personal** scope, `/settings/ai` shows the personal manager → add a key → Test (stored + submitted) → set default → open a personal diagram and confirm chat/advisor work; remove a provider → default repoints/clears. **Org** scope unchanged (manager + active-org usage). Switching context re-scopes the page.

## Out of scope
Personal AI usage metering (`ai_usage` is org-only — a future enhancement), AI Gateway / Vertex OAuth, the org **workspaces** UI (W13 P4).

## Self-review
- **Placeholders:** none — action bodies mirror the verified org ones; scope-parameterization + page branch are concrete.
- **Consistency:** reuses `AiSettingsView`/`ConnectionView`/`ProviderConnectForm`/pure resolver; `savedCredential` via active context fixes a latent first-org bug; `"No AI provider configured."` contract untouched.
- **Scope:** personal AI config UI only; personal usage metering + P4 explicitly deferred.
- **Ambiguity:** `getUserAiSettings` reuses `AiSettingsView` (`orgDefault` = scope default, labeled per scope); personal page omits the usage panel (with a note); the manager defaults to `scope="org"` so existing usages (the workbench dialog) are unaffected unless passed `scope="personal"`.
