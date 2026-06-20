# Multi-provider AI (BYOK) — design blueprint

Status: **data-model foundation landed** (schema + migration `0003`). App wiring
(server actions, `getOrgAiConfig`, settings UI, workbench model selector) is a
deliberate follow-up; this doc is the implementation contract for it.

## Goal

Today an Organization has a **single** AI provider config (`ai_provider_config`,
one row per org). We are moving to **multiple connected providers per org plus
one org-level default model**, so an org can connect Anthropic + OpenAI + Google
+ Mistral + Ollama at once and switch the model the advisor uses — per run or as
the org default.

All keys stay **BYOK and encrypted** (AES-256-GCM via `apps/web/lib/crypto.ts`,
`encryptSecret` / `decryptSecret` — reused as-is, not moved). Strict org scoping
throughout. AGPL.

## Schema (landed in `packages/db/src/schema/app.ts`)

### `ai_connection` — one row per (organizationId, provider)

| column            | type        | notes |
|-------------------|-------------|-------|
| `id`              | text PK     | `crypto.randomUUID()` |
| `organization_id` | text NN     | FK → `organization.id` ON DELETE cascade; indexed (`ai_connection_org_idx`) |
| `provider`        | text NN     | `anthropic \| openai \| google \| mistral \| ollama` — matches `AiProvider`. Plain `text` (not pgEnum) to mirror the legacy table and avoid ALTER TYPE on every new provider; validated with Zod at the boundary. |
| `encrypted_key`   | text null   | BYOK key, AES-256-GCM. Nullable: Ollama (local) needs none. |
| `base_url`        | text null   | self-hosted / proxy / Ollama endpoint override |
| `default_model`   | text null   | the model this provider uses when selected; seed from `DEFAULT_MODELS[provider]` |
| `created_at`      | timestamp   | `defaultNow()` |
| `updated_at`      | timestamp   | `defaultNow()` |

Unique index `ai_connection_org_provider_unique` on `(organization_id, provider)`
— an org connects each provider at most once.

A connection is **usable** when `encrypted_key IS NOT NULL OR provider = 'ollama'`
(same rule as today's `getOrgAiConfig`).

### `ai_org_default` — the org default-model pointer

| column            | type        | notes |
|-------------------|-------------|-------|
| `organization_id` | text PK     | FK → `organization.id` ON DELETE cascade |
| `provider`        | text NN     | logical reference to a connected provider for this org |
| `model`           | text NN     | the default model id |
| `updated_at`      | timestamp   | `defaultNow()` |

**Why a separate table instead of an `is_default` flag on `ai_connection`:**
the default is an org property, not a per-connection one. `organization_id` as
PK makes "exactly one default per org" structurally true — no partial unique
index, no risk of two connections both flagged default. It can also point at a
`(provider, model)` where `model` differs from the connection's `default_model`
(e.g. a cheaper org-wide default), and the absence of a row cleanly means "no
org default set yet". There is **no composite FK** to `ai_connection`; the
action layer enforces that `provider` matches a live connection and repoints /
clears this row when a connection is removed.

Exported types: `AiConnection` / `NewAiConnection`, `AiOrgDefault` /
`NewAiOrgDefault` (`$inferSelect` / `$inferInsert`).

`ai_provider_config` is **kept in place and marked `@deprecated`** so the live
app keeps reading it until the wiring switches over. A later cleanup migration
drops it (see end).

## Migration `0003_good_bug.sql`

Purely additive: `CREATE TABLE ai_connection`, `CREATE TABLE ai_org_default`,
their FKs, the org index and the unique index — plus a clearly-labeled,
**idempotent backfill** (`ON CONFLICT … DO NOTHING`) that copies every existing
`ai_provider_config` row into `ai_connection` and seeds `ai_org_default` from
it. Keys/base_url/model carry over verbatim (already encrypted — no
re-encryption). Reversible: the down direction simply drops the two new tables;
`ai_provider_config` is untouched, so rollback loses nothing.

> **Generate-only.** This migration has NOT been applied to Neon. Apply with
> `pnpm --filter @claril/db db:migrate` after review, against the target
> `DATABASE_URL`. The backfill is embedded in the migration, so a single
> `db:migrate` both creates the tables and seeds them.

## Follow-up wiring (separate task — not done here)

### 1. `getOrgAiConfig` evolves into a resolver

`apps/web/lib/ai.ts` gains a provider-aware resolver. New signature shape:

```
getOrgAiConfig(orgId, opts?: { provider?: AiProvider; model?: string })
  → LLMProviderConfig | null
```

Resolution order:
1. If `opts.provider` is given → load that `ai_connection` for the org.
2. Else load `ai_org_default` for the org → use its `provider`.
3. Else (no default row) → if the org has exactly one usable connection, use it;
   otherwise return `null`.
4. From the chosen connection, build `LLMProviderConfig`:
   - `provider` = connection.provider
   - `model` = `opts.model ?? aiOrgDefault.model (when this provider is the default) ?? connection.defaultModel ?? DEFAULT_MODELS[provider]`
   - `baseUrl` = connection.baseUrl ?? undefined
   - `apiKey` = connection.encryptedKey ? `decryptSecret(...)` : undefined
   - usable-credential guard unchanged (`encryptedKey || provider === 'ollama'`).

A helper `listOrgConnections(orgId)` returns all connections (status + model
options) for the settings cards and the workbench selector. Keep a thin
`ai_provider_config` read path alive only until this lands; then delete it.

### 2. Advisor actions take an optional override

`runAdvisor`, `runDocGen`, `runAdvisorQuestion` in `apps/web/lib/actions.ts`
gain an optional `override?: { provider?: AiProvider; model?: string }` argument
threaded into `resolveAiContext` → `getOrgAiConfig(orgId, override)`. With no
override they fall back to `ai_org_default` (then the sole-connection rule).
Error message stays `"No AI provider configured."` so the existing one-click
setup dialog still triggers.

New write actions (owner/admin only, same membership check as today):
- `connectAiProvider({ provider, apiKey?, baseUrl?, defaultModel? })` —
  upsert `ai_connection` on `(orgId, provider)`; encrypt the key; default the
  model to `DEFAULT_MODELS[provider]` when omitted.
- `removeAiProvider(provider)` — delete the connection; if `ai_org_default`
  pointed at it, repoint to another usable connection or delete the default row.
- `setOrgDefaultModel({ provider, model })` — upsert `ai_org_default`; validate
  `provider` is a connected, usable connection for the org.
- `testAiConnection(provider)` — server-side reachability/auth probe (cheap
  models-list or 1-token call); returns `{ ok, error? }`. Never returns the key.

### 3. Settings UI — connections manager

Replace the single-provider form with a **cards grid** (one card per supported
provider):
- Provider icon + name + status pill (Connected / Not connected / Needs key /
  Error from last test).
- When connected: current `default_model` selector (from the model catalog in
  `@claril/ai-advisor`), **Test** button (`testAiConnection`), **Remove**.
- When not connected: **Add provider** → key + optional baseUrl + model.
- A separate **Org default model** control at the top: a single selector listing
  every model across *connected* providers, writing `setOrgDefaultModel`.
- All controls disabled unless `canEdit` (org owner/admin), as today.

### 4. Workbench — global "connected" model selector

A compact selector in the workbench header lists **every model across all
connected providers** (grouped by provider, each entry `{provider, model}`),
sourced from `listOrgConnections` + the model catalog. Selecting an entry:
- sets the **per-run** choice (passed as the `override` to advisor actions for
  subsequent runs in this session), and/or
- optionally "Set as org default" → `setOrgDefaultModel`.

Default selection reflects `ai_org_default`. If no provider is connected the
selector shows a "Connect AI" CTA linking to settings.

### 5. Cleanup migration (after wiring is live)

Once all readers/writers use `ai_connection` / `ai_org_default` and a prod
backfill has run, a follow-up migration `DROP TABLE ai_provider_config;`
(reversible by re-creating it + back-copying from `ai_connection`, though by
then it is dead). Remove the `@deprecated` table from the schema in the same PR.

## Invariants checklist

- Additive + backward-compatible: app still reads `ai_provider_config`; running
  app unaffected. ✅ (`web` typecheck unchanged.)
- Strict org scoping: every new table FK-bound to `organization` with cascade;
  org-indexed. ✅
- Keys encrypted, never moved: `crypto.ts` reused by follow-up. ✅
- FKs + unique indexes present; migration reversible. ✅
