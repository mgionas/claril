# W13 — Phase 2: Context Switcher + Personal Dashboard — Design Spec

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Builds on:** W13 Phase 1 (foundation, deployed): `personal_project`, `user_ai_connection`/`user_ai_default`, `diagram` parent XOR, personal AI resolver (`getUserAiConfig`/`getAiConfig(ctx)`), `diagramParent`/`assertDiagramAccess` (discriminated).

## Goal
Make Personal vs Organization **real and switchable**: a top-bar scope switcher, a context-aware dashboard (personal `personal_project` flat; org flat-projects), basic **org creation**, and — required for correctness — re-scoping of **AI and Catalog** to the active context / the diagram's own context. Fold in the **legacy migration** so existing work lives in the user's personal space from day one.

## Key correctness rules (drive the whole design)
1. **Active context** (session-level): what the *dashboard / new-thing creation* scopes to. Source of truth = Better Auth `session.activeOrganizationId` (org plugin). Set → membership-validated org; null/invalid → **Personal** (default).
2. **Per-diagram context** (resource-level): AI grounding, AI config, and catalog for an *open diagram* derive from **that diagram's parent**, NOT the session's current selection. An org diagram always uses its org's AI + catalog; a personal diagram uses personal AI + no catalog — even if the user later switches the active context. This prevents a personal diagram from using org keys or seeing the org catalog (cross-context leak).

## Design

### 1. Active-context resolver — `apps/web/lib/tenancy.ts` (or new `context.ts`)
`export type ActiveContext = { kind: "personal"; userId } | { kind: "org"; orgId };`
`getActiveContext(): Promise<ActiveContext>` — read session (`auth.api.getSession`); if `activeOrganizationId` set AND the user is a member → `{ kind: "org", orgId }`; else `{ kind: "personal", userId }`. A **pure** helper `resolveActiveContext(userId, activeOrgId, memberOrgIds)` holds the decision logic (unit-tested). This replaces today's "first org" (`getUserOrgId`) for **data scoping** (org settings reads, dashboard, new-diagram AI gate). `getUserOrgId` itself stays (used internally) but its callers that mean "the active scope" switch to `getActiveContext`.

### 2. Scope switcher — AppShell top-bar (top-left)
A client dropdown before the nav: **Personal** · each org from `authClient.organization.list()` · **+ Create organization**. Shows the current context (personal avatar, or org name/initial). Selecting:
- org → `authClient.organization.setActive({ organizationId })`
- Personal → clear active org (`setActive({ organizationId: null })`)
then `router.refresh()`. The active item is checkmarked. Renders in `AppShell` (so dashboard/catalog/settings all show it); the existing top-right user menu stays.

### 3. Org creation
**+ Create organization** → dialog (name) → `authClient.organization.create({ name, slug })` (Better Auth adds the creator as `owner`), then a server action `ensureWorkspaceForOrg(orgId)` creates the org's **default workspace** (so projects work; full workspaces UI is P4), then `setActive` + refresh.

### 4. Context-aware dashboards — `apps/web/app/page.tsx` + `components/dashboard.tsx`
`page.tsx` resolves `getActiveContext()`:
- **personal** → `listPersonalProjects()`; render Dashboard with `context="personal"`.
- **org** → `listProjects()` scoped to the **active** org's default workspace; `context="org"`.
The Dashboard component takes a `context` prop to label empty states and route create actions to the right server actions. **Personal AI gate** uses `getAiConfig(activeContext)` (personal AI may be "off" until P3 — see §6).

New **personal actions** (`apps/web/lib/personal-actions.ts`): `listPersonalProjects`, `createPersonalProject`, `createPersonalDiagram` (sets `diagram.personalProjectId`), rename/delete personal project + diagram — mirroring `diagram-actions.ts` but on `personal_project` + ownership checks (`assertPersonalProjectAccess`). The org-path `diagram-actions` switch from `ensureUserWorkspace` (first-org) to the **active org's** workspace (`ensureWorkspaceForOrg(activeOrgId)`).

### 5. Per-diagram AI/catalog context — workbench, chat route, advisor actions
Add a helper `diagramContext(diagramId, userId): Promise<AiContext + { orgId? }>` built on `assertDiagramAccess`: org → resolve `orgId` from the workspace, return `{ kind: "org", orgId }`; personal → `{ kind: "personal", userId }`. Then:
- AI config for the open diagram = `getAiConfig(diagramContext)` (not the session's active context).
- Catalog grounding (`buildDiagramAssetContext`) runs **only for org diagrams**; personal diagrams get no asset context.
- `resolveAiContext` (advisor actions) + the chat route resolve config via the diagram's context.

### 6. Personal AI = correct-but-off until P3
The resolver returns personal config when personal `user_ai_connection` rows exist; the **UI to add personal keys is P3**. Until then, personal AI simply resolves to `null` → "No AI provider configured" (the existing CTA). No leak; only the config-entry UI is deferred.

### 7. Catalog gating — `apps/web/app/catalog/*` + AppShell nav
Catalog is org-only. In **personal** active context: hide the Catalog nav item and have `/catalog` render a "Not available in Personal — switch to an organization" state. In **org** context: scope catalog reads to the **active** org (replace `getUserOrgId` with the active org).

### 8. `getDiagram` fix (Phase 1 follow-up)
`getDiagram` currently `innerJoin`s on `diagram.projectId` → personal diagrams return null. Rebuild it to authorize via `assertDiagramAccess` and load the diagram regardless of parent, so personal diagrams open in the workbench.

### 9. Legacy migration (folded in)
A one-time data migration: for each **auto "Personal" org** (org `name = 'Personal'` with exactly one member, who is its `owner`), per project create a `personal_project` owned by that user, re-point its diagrams (`personal_project_id` set, `project_id` null), copy its `ai_connection`→`user_ai_connection` and `ai_org_default`→`user_ai_default`, then delete the org (cascades workspace/project/members/ai_connection). **Orgs with >1 member are left as real orgs.** Implemented as a transactional PL/pgSQL migration (or a guarded, idempotent server routine — chosen in the plan), generate-only, **dry-run on a DB copy** before prod apply. Idempotent: after it runs, no qualifying orgs remain.

## Components & boundaries
- `tenancy.ts`/`context.ts` — active-context resolver (pure decision unit-tested) + `ensureWorkspaceForOrg`.
- `personal-actions.ts` — personal project/diagram CRUD (ownership-scoped). Mirrors `diagram-actions.ts`.
- `ai.ts` — already has `getAiConfig(ctx)`; add `diagramContext()` (maps a diagram → AiContext via `assertDiagramAccess`).
- AppShell + a `ContextSwitcher` client component.
- `dashboard.tsx` — `context` prop; routes to org vs personal actions.
- Re-scoping edits: `page.tsx`, `d/[diagramId]/page.tsx`, chat route, `actions.ts` (`resolveAiContext`), `catalog` page/actions, `org-actions.ts` (active org).

## Testing
- **Unit:** pure `resolveActiveContext` (member→org; non-member/null→personal); the migration's pure mapping logic (project→personal_project, ai_connection→user_ai_connection) if extracted; existing access/AI suites stay green.
- **Migration:** dry-run on a copy — auto-Personal orgs migrate, multi-member orgs untouched, diagrams re-pointed satisfy the XOR check, AI config carried over, re-run is a no-op.
- **Manual:** switch Personal↔org re-scopes dashboard/catalog/AI; create org → default workspace → projects; open a personal diagram (loads, personal AI off → CTA); open an org diagram (org AI + catalog intact); catalog hidden in personal.

## Out of scope (later phases)
- **P3:** personal AI **settings UI** (add/manage personal keys) + catalog-gating polish.
- **P4:** org **workspaces UI** (multiple workspaces, per-workspace access, `workspaceRole` enum admin/editor/viewer), org member/workspace management surfacing.

## Self-review
- **Placeholders:** none — resolver, switcher, dashboards, per-diagram context rule, catalog gating, getDiagram fix, and migration are all concrete.
- **Consistency:** uses Better Auth's native `activeOrganizationId` + org client (already wired); reuses Phase-1 `getAiConfig`/`assertDiagramAccess`/`diagramParent`; preserves the `"No AI provider configured."` CTA contract.
- **Scope:** the switcher's correctness footprint (AI + catalog re-scoping, migration, getDiagram) is included because it can't be safely deferred; the genuinely-deferrable UI (personal AI settings, full workspaces) stays out.
- **Ambiguity:** **active context** drives dashboard/new-creation scope; **per-diagram context** drives an open diagram's AI/catalog — stated explicitly to avoid the leak. Personal AI is correct-but-off until P3.
