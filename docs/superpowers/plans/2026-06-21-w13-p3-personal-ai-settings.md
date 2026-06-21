# W13 — Phase 3: Personal AI Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A settings UI to connect personal (user-scoped) BYOK AI providers, turning personal AI on. Mirror the W8 org actions for the user scope; parameterize the connections-manager with a `scope` prop; make `/settings/ai` and the workbench AI dialog context-aware.

**Architecture:** New user-scoped write actions on `user_ai_connection`/`user_ai_default` (reuse `encryptSecret`/`DEFAULT_MODELS`/pure `repointDefault`); `savedCredential` resolves the active context; `AiConnectionsManager` gains `scope`; `/settings/ai` + `AiSettingsDialog` pick scope from context.

**Spec:** `docs/superpowers/specs/2026-06-21-w13-p3-personal-ai-settings-design.md`.

**Verified facts:**
- `lib/ai.ts`: `getUserAiConfig`, `listUserConnections`, `getAiConfig(ctx)`, pure `repointDefault`, `ConnectionView`, `AiContext`. `lib/context.ts`: `getActiveContext()`.
- `actions.ts`: org actions `connectAiProvider`/`removeAiProvider`/`setOrgDefaultModel`/`getAiSettings`, `AiSettingsView = { canEdit, connections: ConnectionView[], orgDefault? }`, helpers `requireUserId`, `encryptSecret`, `DEFAULT_MODELS`, `repointDefault` imported, `crypto.randomUUID()`, `and`/`eq`.
- `schema.userAiConnection` `{ id, userId, provider, encryptedKey?, baseUrl?, defaultModel?, createdAt, updatedAt }` (unique `(userId,provider)`); `schema.userAiDefault` `{ userId PK, provider, model, updatedAt }`.
- `ai-models.ts` `savedCredential(provider)` currently `getUserOrgId` → `getOrgAiConfig`; `testProviderConnection(provider, model, apiKey?, baseUrl?)`.
- `ai-connections-manager.tsx`: imports org actions; props `{ initialProvider? }`; sub-component `ProviderDetail` calls `connectAiProvider`/`removeAiProvider`/`testProviderConnection`; main reads `data.orgDefault`, calls `setOrgDefaultModel`. Default `Select` label region around `onDefaultChange`.
- `app/settings/ai/page.tsx`: `getUserOrgId` + `getUsageSummary` + `<AiConnectionsManager/>` + `<UsageSummary/>`.
- `ai-settings-dialog.tsx`: renders `<AiConnectionsManager initialProvider=... />` (scope=org default). Opened by `bpmn-workbench.tsx`; `d/[diagramId]/page.tsx` derives the diagram's AI context for `aiConnected`.

---

### Task 1: User-scoped write actions + active-context test fallback

**Files:** `apps/web/lib/actions.ts`, `apps/web/lib/ai-models.ts`

- [ ] **Step 1: Add user-scoped actions** in `actions.ts` (after the org AI actions). Import `listUserConnections` from `@/lib/ai` (alongside existing imports). Use `requireUserId` (no admin gate).
```tsx
export interface ConnectUserAiProviderInput {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export async function connectUserAiProvider(input: ConnectUserAiProviderInput): Promise<void> {
  const userId = await requireUserId();
  const existing = (
    await db
      .select()
      .from(schema.userAiConnection)
      .where(
        and(
          eq(schema.userAiConnection.userId, userId),
          eq(schema.userAiConnection.provider, input.provider),
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
      .update(schema.userAiConnection)
      .set({ encryptedKey, baseUrl, defaultModel, updatedAt: new Date() })
      .where(
        and(
          eq(schema.userAiConnection.userId, userId),
          eq(schema.userAiConnection.provider, input.provider),
        ),
      );
  } else {
    await db.insert(schema.userAiConnection).values({
      id: crypto.randomUUID(),
      userId,
      provider: input.provider,
      encryptedKey,
      baseUrl,
      defaultModel,
    });
  }
}

export async function removeUserAiProvider(provider: AiProvider): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(schema.userAiConnection)
    .where(
      and(
        eq(schema.userAiConnection.userId, userId),
        eq(schema.userAiConnection.provider, provider),
      ),
    );
  const def = (
    await db
      .select()
      .from(schema.userAiDefault)
      .where(eq(schema.userAiDefault.userId, userId))
      .limit(1)
  )[0];
  if (!def || def.provider !== provider) return;
  const remaining = await db
    .select()
    .from(schema.userAiConnection)
    .where(eq(schema.userAiConnection.userId, userId));
  const next = repointDefault(
    remaining.map((c) => ({
      provider: c.provider,
      encryptedKey: c.encryptedKey,
      defaultModel: c.defaultModel,
      baseUrl: c.baseUrl,
    })),
  );
  if (!next) {
    await db.delete(schema.userAiDefault).where(eq(schema.userAiDefault.userId, userId));
  } else {
    const nextConn = remaining.find((c) => c.provider === next)!;
    await db
      .update(schema.userAiDefault)
      .set({
        provider: next,
        model: nextConn.defaultModel ?? DEFAULT_MODELS[next as AiProvider],
        updatedAt: new Date(),
      })
      .where(eq(schema.userAiDefault.userId, userId));
  }
}

export async function setUserDefaultModel(input: {
  provider: AiProvider;
  model: string;
}): Promise<void> {
  const userId = await requireUserId();
  const conn = (
    await db
      .select()
      .from(schema.userAiConnection)
      .where(
        and(
          eq(schema.userAiConnection.userId, userId),
          eq(schema.userAiConnection.provider, input.provider),
        ),
      )
      .limit(1)
  )[0];
  const usable = conn && (Boolean(conn.encryptedKey) || conn.provider === "ollama");
  if (!usable) throw new Error("That provider isn't connected.");
  const existing = (
    await db
      .select()
      .from(schema.userAiDefault)
      .where(eq(schema.userAiDefault.userId, userId))
      .limit(1)
  )[0];
  if (existing) {
    await db
      .update(schema.userAiDefault)
      .set({ provider: input.provider, model: input.model, updatedAt: new Date() })
      .where(eq(schema.userAiDefault.userId, userId));
  } else {
    await db
      .insert(schema.userAiDefault)
      .values({ userId, provider: input.provider, model: input.model });
  }
}

/** Personal AI settings for the connections manager (always editable — own keys). */
export async function getUserAiSettings(): Promise<AiSettingsView> {
  const userId = await requireUserId();
  const connections = await listUserConnections(userId);
  const defRows = await db
    .select()
    .from(schema.userAiDefault)
    .where(eq(schema.userAiDefault.userId, userId))
    .limit(1);
  const orgDefault = defRows[0]
    ? { provider: defRows[0].provider as AiProvider, model: defRows[0].model }
    : undefined;
  return { canEdit: true, connections, orgDefault };
}
```
(`AiSettingsView.orgDefault` is reused as the scope default; the manager labels it per scope. `crypto.randomUUID()` matches the org action's usage.)

- [ ] **Step 2: `savedCredential` → active context** (`ai-models.ts`). Replace the first-org resolution with the active context so a personal stored-key test resolves the user's key:
```tsx
import { getActiveContext } from "@/lib/context";
import { getAiConfig } from "@/lib/ai";
async function savedCredential(
  provider: AiProvider,
): Promise<{ apiKey?: string; baseUrl?: string }> {
  try {
    const ctx = await getActiveContext();
    if (!ctx) return {};
    const cfg = await getAiConfig(ctx, { provider });
    if (cfg && cfg.provider === provider) return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl };
    return {};
  } catch {
    return {};
  }
}
```
Remove now-unused imports (`getUserOrgId`/`getOrgAiConfig`) only if nothing else in the file uses them (grep first).

- [ ] **Step 3: Verify + commit** — `pnpm --filter web typecheck` → PASS.
```bash
git add apps/web/lib/actions.ts apps/web/lib/ai-models.ts
git commit -m "feat(web): user-scoped AI write actions + active-context test fallback (W13 P3) …"
```

---

### Task 2: `scope` prop on the connections manager

**Files:** `apps/web/components/ai/ai-connections-manager.tsx`

- [ ] **Step 1:** Import the user actions alongside the org ones:
```tsx
import {
  connectAiProvider, getAiSettings, removeAiProvider, setOrgDefaultModel,
  connectUserAiProvider, getUserAiSettings, removeUserAiProvider, setUserDefaultModel,
  type AiSettingsView,
} from "@/lib/actions";
```
- [ ] **Step 2:** Add `scope?: "personal" | "org"` to `AiConnectionsManagerProps` (default `"org"`). In the main component, resolve a per-scope action set once:
```tsx
const isPersonal = scope === "personal";
const api = isPersonal
  ? { getSettings: getUserAiSettings, connect: connectUserAiProvider, remove: removeUserAiProvider, setDefault: setUserDefaultModel }
  : { getSettings: getAiSettings, connect: connectAiProvider, remove: removeAiProvider, setDefault: setOrgDefaultModel };
```
Replace the direct `getAiSettings()` calls (load effect + `refresh`) with `api.getSettings()`, and `setOrgDefaultModel(...)` in `onDefaultChange` with `api.setDefault(...)`. Pass `api` (or `scope` + the connect/remove fns) down to the `ProviderDetail` sub-component, replacing its direct `connectAiProvider`/`removeAiProvider` calls with `api.connect`/`api.remove`. `testProviderConnection` stays as-is (server resolves active context).
- [ ] **Step 3: Label adaptation** — the default-model `Select` label: `isPersonal ? "Default model" : "Organization default"`. Any connect-form/manager copy that says "organization" → conditionalize for personal ("stored for your account, encrypted"). Keep `data.orgDefault` reads (it's the scope default for both).
- [ ] **Step 4: Verify + commit** — `pnpm --filter web typecheck` + `pnpm --filter web build` → PASS (existing `<AiConnectionsManager/>` callers default to org — unaffected).
```bash
git add apps/web/components/ai/ai-connections-manager.tsx
git commit -m "feat(web): scope prop on AiConnectionsManager (personal | org) (W13 P3) …"
```

---

### Task 3: Context-aware settings page + workbench dialog scope

**Files:** `apps/web/app/settings/ai/page.tsx`, `apps/web/components/ai-settings-dialog.tsx`, `apps/web/components/bpmn-workbench.tsx`, `apps/web/app/d/[diagramId]/page.tsx`

- [ ] **Step 1: `/settings/ai` page** — branch on `getActiveContext()`:
```tsx
const ctx = await getActiveContext();
if (ctx?.kind === "org") {
  const usage = await getUsageSummary(ctx.orgId);
  return (
    <div className="max-w-2xl">
      <SettingsHeader title="AI providers" description="Connect one or more providers, BYOK. Keys are stored encrypted per organization and never sent to the browser. Pick the model your org uses by default — Claril works fully without AI." />
      <AiConnectionsManager scope="org" />
      <UsageSummary data={usage} />
    </div>
  );
}
return (
  <div className="max-w-2xl">
    <SettingsHeader title="AI providers" description="Connect your own providers, BYOK. Keys are stored encrypted for your account and never sent to the browser — used for your personal diagrams. Claril works fully without AI." />
    <AiConnectionsManager scope="personal" />
    <p className="mt-6 text-xs text-fg-subtle">AI usage is tracked per organization.</p>
  </div>
);
```
Use the **active** org for usage (fixes the prior `getUserOrgId` first-org bug). Keep the session/auth gate.

- [ ] **Step 2: Workbench dialog scope** — `AiSettingsDialog` gains `scope?: "personal" | "org"` (default `"org"`), passed to `<AiConnectionsManager scope={scope} ... />`. `bpmn-workbench.tsx` passes the open diagram's scope to the dialog. `d/[diagramId]/page.tsx` already derives the diagram's AI context for `aiConnected` — also pass a `diagramScope: "personal" | "org"` to the workbench, threaded into the dialog. (Grep how `aiConnected`/the dialog are wired; thread the scope the same way.)

- [ ] **Step 3: Verify + commit** — `pnpm --filter web typecheck` + `pnpm --filter web build` → PASS.
```bash
git add apps/web/app/settings/ai/page.tsx apps/web/components/ai-settings-dialog.tsx apps/web/components/bpmn-workbench.tsx "apps/web/app/d/[diagramId]/page.tsx"
git commit -m "feat(web): context-aware AI settings page + workbench dialog scope (W13 P3) …"
```

---

### Task 4: Verify + manual

- [ ] `pnpm --filter web typecheck` + `pnpm --filter web build` + `cd apps/web && pnpm exec vitest run` → all PASS.
- [ ] Manual: **personal** scope `/settings/ai` shows the personal manager → add a key (guided form) → Test (submitted + stored) → set default → open a **personal** diagram → chat/advisor work; remove a provider → default repoints/clears. **Org** scope `/settings/ai` unchanged + shows active-org usage. Workbench "AI settings" on a personal diagram manages personal AI; on an org diagram manages the org's. Context switch re-scopes the page.

---

## Self-Review
- **Spec coverage:** user actions + test fallback (T1), manager `scope` (T2), context-aware page + dialog (T3), verify (T4). ✓
- **Placeholders:** action bodies mirror the verified org ones on the user tables; manager/page/dialog changes are concrete (UI threading adapts to real wiring).
- **Type consistency:** reuses `AiSettingsView`/`ConnectionView`/`AiContext`; `getUserAiSettings` returns the same shape; `scope` defaults to `"org"` so existing callers are unaffected.
- **Invariants:** BYOK/encryption (`encryptSecret`), keys never returned to client (manager reads `ConnectionView`), pure `repointDefault` reused, `"No AI provider configured."` contract untouched, no schema/resolver change.
- **Out of scope:** personal usage metering, AI Gateway/Vertex, W13 P4 workspaces UI.
