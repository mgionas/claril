# W8 — Multi-Provider Switching (iteration 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire the already-landed `ai_connection` / `ai_org_default` schema end-to-end so an org can connect multiple AI providers, set an org-default model, and switch the model per run from the workbench.

**Architecture:** A pure, unit-tested resolver core in `apps/web/lib/ai.ts` (`resolveConnection` / `repointDefault`) wrapped by db-backed `getOrgAiConfig(orgId, opts?)` + `listOrgConnections(orgId)`; server actions in `actions.ts` for connect/remove/setDefault/test + advisor `override` threading; a settings cards-grid manager (extracting iteration 1's guidance into `ProviderConnectForm`); a workbench `ModelSwitcher` holding a per-session override.

**Spec:** `docs/superpowers/specs/2026-06-21-w8-multi-provider-switching-design.md`. **Blueprint:** `docs/multi-provider-ai.md`.

**Reference facts (verified):**
- `AiProvider = "anthropic" | "openai" | "google" | "mistral" | "ollama"`; `LLMProviderConfig = { provider, model?, apiKey?, baseUrl? }`; `DEFAULT_MODELS: Record<AiProvider,string>` — all from `@claril/ai-advisor`.
- Schema (in `packages/db/src/schema/app.ts`): `aiConnection` `{ id, organizationId, provider, encryptedKey?, baseUrl?, defaultModel?, createdAt, updatedAt }` (unique on `(organizationId, provider)`); `aiOrgDefault` `{ organizationId (PK), provider, model, updatedAt }`; legacy `aiProviderConfig` (`@deprecated`).
- Crypto: `encryptSecret` / `decryptSecret` from `@/lib/crypto`.
- Existing actions: `getAiStatus`, `getAiConfigForSettings`, `saveAiConfig`, `removeAiConfig` (`actions.ts`); `listProviderModels`, `testProviderConnection` (`ai-models.ts`). Advisor actions `runAdvisor` / `runDocGen` / `runAdvisorQuestion` resolve via `resolveAiContext(diagramId?)` → `getOrgAiConfig(orgId)`. Error contract: `"No AI provider configured."`.
- Settings dialog `components/ai-settings-dialog.tsx` (used by `bpmn-workbench.tsx`, `mermaid-workbench.tsx`); iteration 1 added `PROVIDER_META`, `keyLooksValid`, `HowToPanel`. Header is `components/top-bar.tsx`.

---

### Task 0: Apply migration 0003 (local + Neon)

**Files:** none (DB operation).

> Operator step — run by the controller (not a subagent). Migration `0003` is additive + idempotent backfill from `ai_provider_config`. The old read path keeps working until Task 1 lands.

- [ ] **Step 1: Apply to local dev DB**

Run from repo root: `pnpm --filter @claril/db db:migrate`
Expected: `0003_*` applied; no error. (Reads `DATABASE_URL` from the existing env — do not print or echo it.)

- [ ] **Step 2: Verify tables exist locally**

Run: `pnpm --filter @claril/db exec drizzle-kit ... ` is not needed — instead a quick psql-free check via a one-off node/drizzle select is acceptable, OR confirm via the app booting. Minimal: confirm the migrate command reported the two `CREATE TABLE` statements (ai_connection, ai_org_default) and the backfill.

- [ ] **Step 3: Apply to Neon prod**

With explicit user authorization, run `pnpm --filter @claril/db db:migrate` against the prod `DATABASE_URL`. Confirm success. The backfill copies the existing single config into `ai_connection` + seeds `ai_org_default` (`ON CONFLICT DO NOTHING`, so re-runs are safe).

---

### Task 1: Resolver core + `getOrgAiConfig` + `listOrgConnections`

**Files:** `apps/web/lib/ai.ts`, `apps/web/lib/ai.test.ts` (new)

- [ ] **Step 1: Write the failing test** — `apps/web/lib/ai.test.ts`:

```tsx
import { describe, expect, it } from "vitest";
import { resolveConnection, repointDefault, type ConnRow } from "./ai";

const conn = (
  provider: string,
  encryptedKey: string | null,
  defaultModel: string | null = null,
  baseUrl: string | null = null,
): ConnRow => ({ provider, encryptedKey, defaultModel, baseUrl });

describe("resolveConnection", () => {
  it("returns null when there are no connections", () => {
    expect(resolveConnection([], null)).toBeNull();
  });

  it("uses the explicit override provider when given", () => {
    const r = resolveConnection(
      [conn("anthropic", "enc-a"), conn("openai", "enc-o")],
      { provider: "anthropic", model: "claude-opus-4-8" },
      { provider: "openai" },
    );
    expect(r?.provider).toBe("openai");
  });

  it("falls back to the org default provider", () => {
    const r = resolveConnection(
      [conn("anthropic", "enc-a"), conn("openai", "enc-o")],
      { provider: "openai", model: "gpt-5.1" },
    );
    expect(r?.provider).toBe("openai");
    expect(r?.model).toBe("gpt-5.1");
  });

  it("uses the sole usable connection when no default is set", () => {
    const r = resolveConnection([conn("anthropic", "enc-a")], null);
    expect(r?.provider).toBe("anthropic");
  });

  it("returns null with multiple connections and no default", () => {
    expect(
      resolveConnection([conn("anthropic", "enc-a"), conn("openai", "enc-o")], null),
    ).toBeNull();
  });

  it("treats ollama as usable without a key; cloud needs a key", () => {
    expect(resolveConnection([conn("ollama", null)], null)?.provider).toBe("ollama");
    expect(resolveConnection([conn("anthropic", null)], null)).toBeNull();
  });

  it("model precedence: override > org default(model) > connection.defaultModel > DEFAULT_MODELS", () => {
    expect(
      resolveConnection([conn("anthropic", "k", "claude-x")], { provider: "anthropic", model: "default-m" }, { provider: "anthropic", model: "ovr" })?.model,
    ).toBe("ovr");
    expect(
      resolveConnection([conn("anthropic", "k", "claude-x")], { provider: "anthropic", model: "default-m" })?.model,
    ).toBe("default-m");
    expect(resolveConnection([conn("anthropic", "k", "claude-x")], null)?.model).toBe("claude-x");
    expect(resolveConnection([conn("anthropic", "k", null)], null)?.model).toBe("claude-opus-4-8");
  });
});

describe("repointDefault", () => {
  it("picks the first usable remaining provider (sorted) or null", () => {
    expect(repointDefault([conn("openai", "k"), conn("anthropic", "k")])).toBe("anthropic");
    expect(repointDefault([conn("openai", null)])).toBeNull();
    expect(repointDefault([conn("ollama", null)])).toBe("ollama");
    expect(repointDefault([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; confirm FAIL**

Run: `cd apps/web && pnpm exec vitest run lib/ai.test.ts` → FAIL (`resolveConnection`/`repointDefault`/`ConnRow` not exported).

- [ ] **Step 3: Implement** — edit `apps/web/lib/ai.ts`. Add imports and the pure core + db wrappers. Final file:

```tsx
import { and, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { AiProvider, DEFAULT_MODELS, type LLMProviderConfig } from "@claril/ai-advisor";
import { decryptSecret } from "@/lib/crypto";

/** The org the user belongs to (V1: first membership). */
export async function getUserOrgId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

/** Per-run resolution override. */
export interface AiOverride {
  provider?: AiProvider;
  model?: string;
}

/** Minimal connection shape the pure resolver needs (subset of `aiConnection`). */
export interface ConnRow {
  provider: string;
  encryptedKey: string | null;
  defaultModel: string | null;
  baseUrl: string | null;
}

/** A provider connection summarized for the UI (no secrets). */
export interface ConnectionView {
  provider: AiProvider;
  hasKey: boolean;
  usable: boolean;
  baseUrl?: string;
  defaultModel?: string;
  isOrgDefault: boolean;
}

const isUsable = (c: { provider: string; encryptedKey: string | null }) =>
  Boolean(c.encryptedKey) || c.provider === "ollama";

/**
 * Pure resolution of which connection + model to use. Order: explicit override
 * provider → org default provider → the sole usable connection → null. Model
 * precedence: override model → org-default model (when that provider is chosen)
 * → connection.defaultModel → DEFAULT_MODELS[provider]. No I/O, no decryption.
 */
export function resolveConnection(
  conns: ConnRow[],
  orgDefault: { provider: string; model: string } | null,
  opts?: AiOverride,
): { provider: AiProvider; model: string; baseUrl?: string; encryptedKey: string | null } | null {
  let provider: string | undefined = opts?.provider ?? orgDefault?.provider;
  let conn: ConnRow | undefined;

  if (provider) {
    conn = conns.find((c) => c.provider === provider);
  } else {
    const usable = conns.filter(isUsable);
    if (usable.length === 1) {
      conn = usable[0];
      provider = conn.provider;
    }
  }

  if (!conn || !provider || !isUsable(conn)) return null;

  const model =
    (opts?.model && opts.model.length > 0 ? opts.model : undefined) ??
    (orgDefault && orgDefault.provider === provider ? orgDefault.model : undefined) ??
    conn.defaultModel ??
    DEFAULT_MODELS[provider as AiProvider];

  return {
    provider: provider as AiProvider,
    model,
    baseUrl: conn.baseUrl ?? undefined,
    encryptedKey: conn.encryptedKey,
  };
}

/**
 * Deterministically pick a provider to repoint the org default to after a
 * connection is removed: the first usable remaining provider (alphabetical),
 * or null when none remain usable.
 */
export function repointDefault(remaining: ConnRow[]): string | null {
  return (
    remaining
      .filter(isUsable)
      .map((c) => c.provider)
      .sort()[0] ?? null
  );
}

/**
 * Decrypted, ready-to-use AI config for an org, or null when nothing usable.
 * `opts` lets a single run override the provider/model (workbench selector);
 * with no opts it resolves the org default, then the sole-connection rule.
 */
export async function getOrgAiConfig(
  orgId: string,
  opts?: AiOverride,
): Promise<LLMProviderConfig | null> {
  const [conns, defRows] = await Promise.all([
    db
      .select()
      .from(schema.aiConnection)
      .where(eq(schema.aiConnection.organizationId, orgId)),
    db
      .select()
      .from(schema.aiOrgDefault)
      .where(eq(schema.aiOrgDefault.organizationId, orgId))
      .limit(1),
  ]);

  const def = defRows[0] ? { provider: defRows[0].provider, model: defRows[0].model } : null;
  const resolved = resolveConnection(conns, def, opts);
  if (!resolved) return null;

  return {
    provider: resolved.provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    apiKey: resolved.encryptedKey ? decryptSecret(resolved.encryptedKey) : undefined,
  };
}

/** All connections for an org, summarized for settings cards + the workbench selector. */
export async function listOrgConnections(orgId: string): Promise<ConnectionView[]> {
  const [conns, defRows] = await Promise.all([
    db
      .select()
      .from(schema.aiConnection)
      .where(eq(schema.aiConnection.organizationId, orgId)),
    db
      .select()
      .from(schema.aiOrgDefault)
      .where(eq(schema.aiOrgDefault.organizationId, orgId))
      .limit(1),
  ]);
  const defaultProvider = defRows[0]?.provider;
  return conns
    .map((c) => ({
      provider: c.provider as AiProvider,
      hasKey: Boolean(c.encryptedKey),
      usable: isUsable(c),
      baseUrl: c.baseUrl ?? undefined,
      defaultModel: c.defaultModel ?? undefined,
      isOrgDefault: c.provider === defaultProvider,
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}
```
Note: `AiProvider` is imported as a value here only for the type cast — keep it as a `type` import if your lint prefers (`import { DEFAULT_MODELS, type AiProvider, type LLMProviderConfig }`). Use whichever satisfies `noUnusedLocals` + `verbatimModuleSyntax`.

- [ ] **Step 4: Run the test; confirm PASS.** `cd apps/web && pnpm exec vitest run lib/ai.test.ts` → PASS.

- [ ] **Step 5: Typecheck + commit**

`pnpm --filter web typecheck` → PASS (callers using `getOrgAiConfig(orgId)` still compile — `opts` is optional).
```bash
git add apps/web/lib/ai.ts apps/web/lib/ai.test.ts
git commit -m "$(cat <<'EOF'
feat(web): multi-provider AI resolver + listOrgConnections (W8)

getOrgAiConfig now reads ai_connection/ai_org_default with override support;
pure resolveConnection + repointDefault are unit-tested. Adds listOrgConnections.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
Stage ONLY these two files (leave .archmantic/model.json, .gitignore, AGENTS.md untouched).

---

### Task 2: Write actions + settings reader + advisor override threading

**Files:** `apps/web/lib/actions.ts`, `apps/web/lib/ai-models.ts`

- [ ] **Step 1: Add the connection write actions + settings reader** in `actions.ts`.

Add a small role helper (reuse the existing inline pattern) near the AI section:
```tsx
async function requireOrgAdmin(): Promise<string> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  if (!orgId) throw new Error("No organization.");
  const membership = (
    await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
      .limit(1)
  )[0];
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new Error("Only organization owners or admins can configure AI.");
  }
  return orgId;
}
```

Connect/upsert:
```tsx
export interface ConnectAiProviderInput {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export async function connectAiProvider(input: ConnectAiProviderInput): Promise<void> {
  const orgId = await requireOrgAdmin();
  const existing = (
    await db
      .select()
      .from(schema.aiConnection)
      .where(
        and(
          eq(schema.aiConnection.organizationId, orgId),
          eq(schema.aiConnection.provider, input.provider),
        ),
      )
      .limit(1)
  )[0];

  const encryptedKey =
    input.apiKey && input.apiKey.length > 0
      ? encryptSecret(input.apiKey)
      : (existing?.encryptedKey ?? null);

  const defaultModel =
    (input.defaultModel && input.defaultModel.length > 0 ? input.defaultModel : null) ??
    existing?.defaultModel ??
    DEFAULT_MODELS[input.provider];

  const baseUrl = input.baseUrl && input.baseUrl.length > 0 ? input.baseUrl : null;

  if (existing) {
    await db
      .update(schema.aiConnection)
      .set({ encryptedKey, baseUrl, defaultModel, updatedAt: new Date() })
      .where(
        and(
          eq(schema.aiConnection.organizationId, orgId),
          eq(schema.aiConnection.provider, input.provider),
        ),
      );
  } else {
    await db.insert(schema.aiConnection).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      provider: input.provider,
      encryptedKey,
      baseUrl,
      defaultModel,
    });
  }
}
```

Remove (with default repoint via the pure helper):
```tsx
export async function removeAiProvider(provider: AiProvider): Promise<void> {
  const orgId = await requireOrgAdmin();
  await db
    .delete(schema.aiConnection)
    .where(
      and(
        eq(schema.aiConnection.organizationId, orgId),
        eq(schema.aiConnection.provider, provider),
      ),
    );

  const def = (
    await db
      .select()
      .from(schema.aiOrgDefault)
      .where(eq(schema.aiOrgDefault.organizationId, orgId))
      .limit(1)
  )[0];
  if (!def || def.provider !== provider) return;

  // The default pointed at the removed provider — repoint or clear.
  const remaining = await db
    .select()
    .from(schema.aiConnection)
    .where(eq(schema.aiConnection.organizationId, orgId));
  const next = repointDefault(
    remaining.map((c) => ({
      provider: c.provider,
      encryptedKey: c.encryptedKey,
      defaultModel: c.defaultModel,
      baseUrl: c.baseUrl,
    })),
  );
  if (!next) {
    await db.delete(schema.aiOrgDefault).where(eq(schema.aiOrgDefault.organizationId, orgId));
  } else {
    const nextConn = remaining.find((c) => c.provider === next)!;
    await db
      .update(schema.aiOrgDefault)
      .set({
        provider: next,
        model: nextConn.defaultModel ?? DEFAULT_MODELS[next as AiProvider],
        updatedAt: new Date(),
      })
      .where(eq(schema.aiOrgDefault.organizationId, orgId));
  }
}
```

Set org default (validate it's a usable connection):
```tsx
export async function setOrgDefaultModel(input: {
  provider: AiProvider;
  model: string;
}): Promise<void> {
  const orgId = await requireOrgAdmin();
  const conn = (
    await db
      .select()
      .from(schema.aiConnection)
      .where(
        and(
          eq(schema.aiConnection.organizationId, orgId),
          eq(schema.aiConnection.provider, input.provider),
        ),
      )
      .limit(1)
  )[0];
  const usable = conn && (Boolean(conn.encryptedKey) || conn.provider === "ollama");
  if (!usable) throw new Error("That provider isn't connected.");

  const existing = (
    await db
      .select()
      .from(schema.aiOrgDefault)
      .where(eq(schema.aiOrgDefault.organizationId, orgId))
      .limit(1)
  )[0];
  if (existing) {
    await db
      .update(schema.aiOrgDefault)
      .set({ provider: input.provider, model: input.model, updatedAt: new Date() })
      .where(eq(schema.aiOrgDefault.organizationId, orgId));
  } else {
    await db
      .insert(schema.aiOrgDefault)
      .values({ organizationId: orgId, provider: input.provider, model: input.model });
  }
}
```

Settings reader (replaces `getAiConfigForSettings` for the new UI; keep the old one until the dialog is migrated in Task 3, then delete it):
```tsx
export interface AiSettingsView {
  canEdit: boolean;
  connections: ConnectionView[];
  orgDefault?: { provider: AiProvider; model: string };
}

export async function getAiSettings(): Promise<AiSettingsView> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  if (!orgId) return { canEdit: false, connections: [] };
  const membership = (
    await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
      .limit(1)
  )[0];
  const canEdit = membership?.role === "owner" || membership?.role === "admin";
  const connections = await listOrgConnections(orgId);
  const defRows = await db
    .select()
    .from(schema.aiOrgDefault)
    .where(eq(schema.aiOrgDefault.organizationId, orgId))
    .limit(1);
  const orgDefault = defRows[0]
    ? { provider: defRows[0].provider as AiProvider, model: defRows[0].model }
    : undefined;
  return { canEdit, connections, orgDefault };
}
```
Add imports at the top of `actions.ts` as needed: `listOrgConnections`, `repointDefault`, `type ConnectionView` from `@/lib/ai`; `DEFAULT_MODELS` (already imported); `AiProvider` (already imported). Keep `encryptSecret` import.

- [ ] **Step 2: Thread `override` through the advisor actions.**

Change `resolveAiContext` to accept an override and forward it:
```tsx
async function resolveAiContext(diagramId?: string, override?: AiOverride) {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  const config = orgId ? await getOrgAiConfig(orgId, override) : null;
  if (!config || !orgId) throw new Error("No AI provider configured.");
  const assetContext = diagramId
    ? await buildDiagramAssetContext(orgId, diagramId)
    : undefined;
  const projectId = diagramId ? await projectIdForDiagram(diagramId) : null;
  return { config, assetContext, orgId, projectId };
}
```
Import `type AiOverride` from `@/lib/ai`. Add an optional `override?: AiOverride` trailing parameter to the exported advisor actions and pass it down:
- `runAdvisor(...)` — currently calls `getOrgAiConfig(orgId)` directly (line ~230); change to `getOrgAiConfig(orgId, override)` and add the `override?: AiOverride` param.
- `runDocGen(graph, findings, diagramId?, override?)` → `resolveAiContext(diagramId, override)`.
- `runAdvisorQuestion(...)` and `generateDiagramFromPrompt(...)` and any other `resolveAiContext()` caller → add `override?: AiOverride` param, pass through. Keep parameter order backward-compatible (override last, optional).

> Do NOT change the `"No AI provider configured."` string. With no override, behavior == org default == today's single-config (post-backfill).

- [ ] **Step 3: Generalize the stored-credential test** in `ai-models.ts`.

`savedCredential(provider)` currently calls `getOrgAiConfig(orgId)` and checks `cfg.provider === provider`. Update it to pass the provider so it loads that specific connection:
```tsx
    const cfg = await getOrgAiConfig(orgId, { provider });
    if (cfg && cfg.provider === provider) return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl };
```
Keep `listProviderModels` / `testProviderConnection` signatures as-is (the connect form reuses them with submitted values; a connected card's "Test" calls `testProviderConnection(provider)` with a blank key → falls back to `savedCredential`).

- [ ] **Step 4: Typecheck**

`pnpm --filter web typecheck` → PASS. Fix any caller of the changed advisor actions (e.g. in `bpmn-workbench.tsx`/`chat` route) — they pass no override, so only the optional param is added; no call site needs editing unless it positionally passed something after `diagramId` (none do).

- [ ] **Step 5: Commit**
```bash
git add apps/web/lib/actions.ts apps/web/lib/ai-models.ts
git commit -m "$(cat <<'EOF'
feat(web): multi-provider AI write actions + advisor override (W8)

connectAiProvider/removeAiProvider/setOrgDefaultModel + getAiSettings over
ai_connection/ai_org_default (owner/admin only, default repoint on remove);
advisor actions accept an optional per-run provider/model override.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Settings — connections manager UI

**Files:** `apps/web/components/ai-settings-dialog.tsx` (refactor), `apps/web/components/provider-connect-form.tsx` (new)

> Goal: replace the single-provider 3-step flow with a cards grid (one card per provider) + a top org-default selector, **reusing iteration 1's guidance** (`HowToPanel`, `keyPlaceholder`, `keyLooksValid`, `note`) inside each card's connect form. READ the current `ai-settings-dialog.tsx` fully first — preserve its dialog shell, `ProviderIcon`, `ModelPicker`, Test result styling, and design tokens.

- [ ] **Step 1: Extract `ProviderConnectForm`** into `components/provider-connect-form.tsx`.

A presentational form for connecting/editing ONE provider, lifted from the current step-1 key UI + the `HowToPanel`. Props:
```tsx
export interface ProviderConnectFormProps {
  provider: AiProvider;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  /** Disabled when the current user can't edit. */
  disabled?: boolean;
}
```
It renders, for the given `provider` (via `providerMeta(provider)`):
- `HowToPanel` (move `HowToPanel` here from `ai-settings-dialog.tsx`, export it, and re-import it in the dialog — single definition).
- The API-key `Input` with `placeholder={meta.keyPlaceholder ?? "Leave blank to keep the existing key"}`, the soft `!keyLooksValid(provider, apiKey)` warning, and `meta.note` (exactly the iteration-1 markup).
- The base-URL `Input` for providers that use it (ollama/openai) — same condition as today.
- The model selector (`ModelPicker`/`listProviderModels`) — same component the dialog uses today.
All controls honor `disabled`.

- [ ] **Step 2: Rebuild the dialog body as a connections manager.**

Replace the 3-step wizard state with:
- Load `getAiSettings()` on open → `{ canEdit, connections, orgDefault }`.
- **Org default selector** at the top: a `<select>`/`ModelPicker`-style control listing every `{provider, model}` across `connections.filter(c => c.usable)` (group by provider, label `"{Provider} · {model}"`), value = `orgDefault`. On change → `setOrgDefaultModel({provider, model})` then refresh. Hidden/disabled when `!canEdit` or zero usable connections.
- **Cards grid** — one card per `PROVIDER_META` entry:
  - Header: `ProviderIcon` + `meta.label` + status pill: **Connected** (green) if a matching `ConnectionView.usable`; **Needs key** (amber) if connected row exists but not usable; **Not connected** (muted) otherwise; plus a small "Default" chip when `isOrgDefault`.
  - Connected → show current model + buttons: **Test** (`testProviderConnection(provider)` with blank key → uses stored cred; show ok/error), **Edit** (expands `ProviderConnectForm` prefilled), **Remove** (`removeAiProvider(provider)` → confirm → refresh).
  - Not connected → **Add** button expands `ProviderConnectForm` (blank) + a **Connect** button calling `connectAiProvider({provider, apiKey, baseUrl, defaultModel: model})` → refresh.
  - All mutating controls disabled unless `canEdit`.
- Keep the dialog's existing shell/title/close. Remove the old step indicator + `saveAiConfig` call path from this component.

> This is the largest UI change. Keep each card's local expand/edit state isolated. Reuse existing tokens and the `ModelPicker`. Use `useState` + a `refresh()` that re-calls `getAiSettings()` after each mutation (or `router.refresh()` if the data is server-loaded — match how the dialog loads data today).

- [ ] **Step 3: Point callers at the new manager + remove dead single-config code.**

- `bpmn-workbench.tsx` / `mermaid-workbench.tsx` keep rendering `<AiSettingsDialog .../>` (now the manager) — verify props still match; adjust if the dialog's props changed (e.g. it no longer needs an initial single-config prop).
- Update `getAiStatus` if needed (it already uses `getOrgAiConfig()` no-arg → resolves the default; fine).
- Delete `getAiConfigForSettings` + `SaveAiConfigInput`/`saveAiConfig` + `removeAiConfig` from `actions.ts` **only if** no other caller remains (grep first). If anything else references them, leave them and note it.

- [ ] **Step 4: Typecheck + build**

`pnpm --filter web typecheck` → PASS. `pnpm --filter web build` → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/components/ai-settings-dialog.tsx apps/web/components/provider-connect-form.tsx apps/web/lib/actions.ts
git commit -m "$(cat <<'EOF'
feat(web): AI settings connections manager — multi-provider cards (W8)

Replace the single-provider wizard with a per-provider cards grid + org-default
model selector; reuse the guided connect form (HowToPanel/keyLooksValid) per
card. Connect/Test/Remove/SetDefault via the new actions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Workbench — model selector (per-session override)

**Files:** `apps/web/components/top-bar.tsx`, `apps/web/components/model-switcher.tsx` (new), and the advisor call sites in `bpmn-workbench.tsx` / `mermaid-workbench.tsx` / the chat route as needed.

- [ ] **Step 1: `ModelSwitcher`** (`components/model-switcher.tsx`).

A compact header control:
```tsx
export interface ModelSwitcherProps {
  connections: ConnectionView[];               // from listOrgConnections (usable only)
  orgDefault?: { provider: AiProvider; model: string };
  value: AiOverride | null;                    // current per-session override (null = use org default)
  onChange: (value: AiOverride | null) => void;
  canSetDefault: boolean;                       // canEdit
  onSetDefault: (v: { provider: AiProvider; model: string }) => void;
}
```
Renders a dropdown grouped by provider listing each model across connected providers (catalog labels from `listProviderModels`/`MODEL_CATALOG`). Selecting an entry calls `onChange({provider, model})`. A footer item **"Set as org default"** (shown when `canSetDefault` and a non-default entry is selected) calls `onSetDefault`. The displayed label shows the effective selection (override or `orgDefault`). With zero usable connections, render a **"Connect AI"** button that opens the settings manager (reuse the existing settings-open handler).

- [ ] **Step 2: Hold the override in workbench state + thread it to advisor calls.**

In `bpmn-workbench.tsx` (and `mermaid-workbench.tsx`): add `const [aiOverride, setAiOverride] = useState<AiOverride | null>(null);`, render `<ModelSwitcher ... value={aiOverride} onChange={setAiOverride} .../>` in the top bar, and pass `aiOverride ?? undefined` as the new trailing `override` arg to every advisor action call (`runAdvisor`, `runDocGen`, `runAdvisorQuestion`, `generateDiagramFromPrompt`, and the chat/proposeEdit path if it calls these actions). For the **chat route** (`app/api/ai/chat/route.ts`) and **proposeEdit**: if they resolve config server-side from the session, accept the override from the request body (add an optional `override` field, validate with Zod, pass to `getOrgAiConfig`). Match each call site's existing signature.

> Source `connections`/`orgDefault` for the switcher from a server load (`getAiSettings()` or `listOrgConnections` via a small server action exposed to the client) when the workbench mounts; refresh after a settings change.

- [ ] **Step 3: Typecheck + build**

`pnpm --filter web typecheck` → PASS. `pnpm --filter web build` → PASS.

- [ ] **Step 4: Commit**
```bash
git add apps/web/components/top-bar.tsx apps/web/components/model-switcher.tsx apps/web/components/bpmn-workbench.tsx apps/web/components/mermaid-workbench.tsx apps/web/app/api/ai/chat/route.ts
git commit -m "$(cat <<'EOF'
feat(web): workbench model switcher — per-run provider/model override (W8)

Header selector across all connected providers; sets a per-session override
threaded into advisor calls, with an explicit "set as org default".

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Manual verification

**Files:** none (runtime).

- [ ] **Step 1:** Restart `pnpm dev`. With migration applied + an existing single config backfilled:
1. Existing AI still works (advisor/chat run with the backfilled default).
2. Settings: the previously-configured provider shows **Connected** + **Default**. Connect a 2nd provider (guided form: steps, placeholder, soft warning) → **Test** → it's added.
3. Set the org default to the 2nd provider's model → reload → default persists.
4. **Remove** the default provider → default repoints to the remaining one (or clears if none) — confirm advisor still resolves.
5. Workbench selector lists models across both providers; pick the non-default one → run advisor → it uses the override (verify via the run's provider/model in the response/usage). "Set as org default" updates settings.
6. Sign in as a non-admin (or simulate `canEdit=false`) → all connect/remove/default controls are disabled; the selector still lets you pick a per-session model.

Expected: no regression; switching works end-to-end. Note any deviation.

---

## Self-Review
- **Spec coverage:** migration (Task 0); resolver + listOrgConnections (Task 1); connect/remove/setDefault/test + override threading + settings reader (Task 2); cards-grid manager reusing guided form (Task 3); workbench per-session selector + set-default (Task 4); manual matrix (Task 5). ✓
- **Placeholders:** none — backend code is complete; UI tasks give exact props/signatures/reuse points and instruct adaptation to existing markup (same approach that worked in iteration 1).
- **Type consistency:** `AiOverride`, `ConnRow`, `ConnectionView`, `AiSettingsView` defined once in Task 1/2 and reused verbatim in Tasks 2–4; advisor `override` is always the optional trailing param; `resolveConnection`/`repointDefault` signatures match their tests.
- **Invariants:** BYOK/encryption (`crypto.ts` reused), strict org-scoping (every query org-filtered + admin gate on writes), `"No AI provider configured."` contract preserved, no new dependency. ✓
- **Out of scope:** AI Gateway, Vertex OAuth, `DROP TABLE ai_provider_config` cleanup. ✓
