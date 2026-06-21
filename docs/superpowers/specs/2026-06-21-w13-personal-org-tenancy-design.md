# W13 — Personal / Organization Tenancy — Design Spec (Foundation)

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Scope of THIS spec:** **Phase 1 — Foundation only** (schema + additive migration + resolver/access plumbing, unit-tested, shipped dark). The full model is captured below for context; Phases 2–5 (UX, switcher, dual AI settings, org workspaces UI, legacy data migration) are explicitly **out of scope** and get their own specs/plans.

## The model (full vision — context)

Two top-level contexts a user switches between:

**Personal** (one per user, solo, a subsystem separate from orgs)
- User-scoped `personal_project → diagram`, flat (no Workspace tier).
- Own BYOK AI keys (user-scoped).
- **No unified knowledge** — no Asset Catalog, no org AI memory/impact/templates. Inspector works; AI grounding limited to the open diagram.
- No members/roles.

**Organization** (zero or many; create or be invited)
- Members with org roles `owner | admin | member`.
- **Unified knowledge** (org-wide): shared Asset Catalog, AI grounding/memory across diagrams, cross-project impact, shared templates/conventions.
- **Workspaces** (the user's "directions"): `organization → workspace → project → diagram`.
- **Workspace access = explicit grant only** (default: no access). Workspace roles `admin | editor | viewer`.
- Org-shared AI config (admin-managed).

**Cross-cutting:** an active-context switcher (Personal / Org X) scopes the dashboard, catalog, AI, and settings. Org `owner/admin` manage org membership *and* per-workspace access/roles.

**Chosen architecture (from brainstorm):** *fully separate personal subsystem* at the **ownership/config layer**, **shared diagram engine**. Personal gets dedicated `personal_project` + `user_ai_connection`/`user_ai_default` tables and no catalog; the `diagram` table (and the canvas/inspector/versioning/AI-editing stack) stays shared, with `diagram` pointing at **either** a `project` (org) **or** a `personal_project` (personal), XOR.

## Current state (verified)
- Chain today: `organization → workspace → project → diagram` (`packages/db/src/schema/app.ts`). `workspace_member.role` uses a `workspaceRole` pgEnum (current default `"member"`). A `project_member` table also exists.
- `tenancy.ts` bootstraps an auto-created **"Personal" org** + default workspace per user (`ensureUserWorkspace`) and holds `assert{Workspace,Project,Diagram}Access`.
- AI config is org-scoped: `ai_connection` / `ai_org_default` (W8), with a **pure** resolver core `resolveConnection` / `repointDefault` + `getOrgAiConfig(orgId, opts?)` / `listOrgConnections(orgId)` in `apps/web/lib/ai.ts`.
- `diagram.projectId` is currently `NOT NULL`.

## Foundation design (this spec)

### 1. Schema (`packages/db/src/schema/app.ts`) — purely additive
- **New `personal_project`**: `{ id text PK, ownerUserId text NN → user(id) ON DELETE cascade, name text NN, description text?, createdAt, updatedAt }`, index on `ownerUserId`.
- **New `user_ai_connection`**: `{ id text PK, userId text NN → user(id) cascade, provider text NN, encryptedKey text?, baseUrl text?, defaultModel text?, createdAt, updatedAt }`, **unique `(userId, provider)`**, index on `userId`. (Mirrors `ai_connection` but keyed by user.)
- **New `user_ai_default`**: `{ userId text PK → user(id) cascade, provider text NN, model text NN, updatedAt }`. (Mirrors `ai_org_default`.)
- **`diagram` changes**: add `personalProjectId text? → personal_project(id) ON DELETE cascade`; **drop `NOT NULL` on `projectId`**; add a **CHECK** that exactly one parent is set: `(project_id IS NULL) <> (personal_project_id IS NULL)`. Add index on `personalProjectId`.

> The `workspaceRole` enum value set (`admin | editor | viewer`) is **formalized in the org-workspaces phase** (it requires an `ALTER TYPE` and is only exercised by the roles UI). Foundation leaves the enum as-is to stay additive.

Exported Drizzle types: `PersonalProject`/`NewPersonalProject`, `UserAiConnection`/`NewUserAiConnection`, `UserAiDefault`/`NewUserAiDefault`.

### 2. Migration — generate-only, additive only
A single migration that `CREATE TABLE`s the three new tables (+ FKs/indexes/unique), `ALTER TABLE diagram ADD COLUMN personal_project_id`, `ALTER COLUMN project_id DROP NOT NULL`, and `ADD CONSTRAINT` for the XOR check. **No data migration** here — existing diagrams keep `project_id` set, so the XOR check passes for all current rows. Reversible (down = drop new tables/column/constraint, restore `NOT NULL`). **Generate-only**; applied with explicit authorization. *(The legacy "Personal" org → personal-space data migration is Phase 5, a separate spec.)*

### 3. Personal AI resolver (`apps/web/lib/ai.ts`) — reuse the pure core
- Add an `AiContext` union: `{ kind: "personal"; userId: string } | { kind: "org"; orgId: string }`.
- Add `getUserAiConfig(userId, opts?: AiOverride): Promise<LLMProviderConfig | null>` and `listUserConnections(userId): Promise<ConnectionView[]>` — identical shape to the org versions but reading `user_ai_connection` / `user_ai_default`. **Reuse the existing pure `resolveConnection` / `repointDefault`** (they already operate on `ConnRow[]`), so no logic duplication — only the loaders differ.
- Add a context-dispatch helper `getAiConfig(ctx: AiContext, opts?)` that routes to `getOrgAiConfig` or `getUserAiConfig`. Existing `getOrgAiConfig` callers are untouched.

### 4. Access helpers (`apps/web/lib/tenancy.ts`)
- Add `assertPersonalProjectAccess(userId, personalProjectId)` → throws unless `personal_project.ownerUserId === userId`.
- Extend `assertDiagramAccess(userId, diagramId)`: resolve the diagram's parent — if `personalProjectId` set → personal owner check; if `projectId` set → existing org chain (workspace → workspaceMember). Returns a discriminated result `{ kind: "personal"; personalProjectId } | { kind: "org"; projectId; workspaceId }` so callers can derive context (and whether the catalog/unified-knowledge applies).
- Add a small pure helper `diagramParent(diagram)` returning the XOR parent, used wherever code reads `diagram.projectId` (which is now nullable).

### 5. TypeScript ripple (handle in foundation)
Making `diagram.projectId` nullable tightens its type to `string | null`. The plan enumerates every reader of `diagram.projectId` (grep) and routes them through `diagramParent`/the extended `assertDiagramAccess` so they handle both parents. With no personal diagrams existing yet, runtime behavior is unchanged — only the types are made honest. No UI changes.

## Components & boundaries
- `@claril/db` schema + migration — additive, reversible.
- `apps/web/lib/ai.ts` — personal AI loaders + context dispatch (pure core reused). Unit-testable (the pure core already is; add user-loader-shape coverage via the pure path).
- `apps/web/lib/tenancy.ts` — personal access + diagram-parent resolution. The decision logic should be extracted into a **pure** function (given parent + memberships → allow/deny) so it's unit-tested without a live DB.
- No new dependency. Crypto (`encryptSecret`/`decryptSecret`) reused for personal keys.

## Testing
- **Unit:** the pure access-decision function (personal owner allow/deny; org workspace-member allow/deny); the AI resolver already-pure core re-exercised for the personal shape; `diagramParent` XOR resolution (project-only, personal-only, neither/both → error).
- **Migration:** dry-run on a DB copy — all existing diagrams satisfy the XOR check; down-migration restores cleanly.
- No e2e/UX (nothing user-facing ships in the foundation).

## Out of scope (later phases — own specs)
- **Phase 2:** active-context switcher + persistence; personal dashboard (list/create `personal_project`).
- **Phase 3:** personal AI settings UI (dual config) + catalog/unified-knowledge gating (hidden in personal).
- **Phase 4:** org **workspaces UI** + explicit-grant access + `workspaceRole` (`admin/editor/viewer`) formalization + per-workspace member management; org creation flow.
- **Phase 5:** legacy data migration ("Personal" org → personal space: projects→`personal_project`, re-point diagrams, `ai_connection`→`user_ai_connection`), retire pseudo-orgs, cleanup. Orgs with >1 member stay real orgs.

## Self-review
- **Placeholders:** none — every table, column, FK, the XOR check, and the resolver/access API are concrete.
- **Consistency:** additive + reversible; reuses the W8 pure resolver core (no duplicated AI logic); existing org paths untouched; `"No AI provider configured."`/access contracts preserved.
- **Scope:** foundation only — no UX, no data migration; ships dark behind unchanged behavior. Later phases enumerated.
- **Ambiguity:** diagram parent is strict XOR (DB CHECK + pure helper); personal access = sole-owner; foundation explicitly does NOT change the `workspaceRole` enum values (deferred to Phase 4) to keep the migration additive.
