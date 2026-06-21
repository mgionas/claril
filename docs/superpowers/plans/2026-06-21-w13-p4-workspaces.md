# W13 — Phase 4: Org Workspaces UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Org workspaces as first-class — multiple workspaces per org with explicit-grant members + roles (admin/editor/viewer), drilled Org → Workspace → Projects → Diagrams via dedicated pages. Personal scope unchanged.

**Architecture:** Additive `workspace_role` enum migration; pure `canDo` + `requireWorkspaceRole` role layer; `workspace-actions.ts` (workspace + member CRUD, role-gated); org project actions rescoped to an explicit `workspaceId`; org `/` → WorkspacesGrid, new `/w/[workspaceId]` page reusing `ProjectsList`, a manage dialog, and scope-aware sidebar nav.

**Spec:** `docs/superpowers/specs/2026-06-21-w13-p4-workspaces-design.md`.

**Verified facts:**
- `packages/db/src/schema/app.ts`: `workspaceRole = pgEnum("workspace_role", ["admin","member"])`; `workspace` `{id, organizationId, name, slug, createdAt}`; `workspaceMember` `{id, workspaceId, userId, role, createdAt}` unique `(workspaceId,userId)`; `project` `{id, workspaceId, name, description, …}`.
- `tenancy.ts`: `ensureWorkspaceForOrg(userId, orgId)`, `assertWorkspaceAccess(userId, workspaceId)`, `assertProjectAccess(userId, projectId)`. `schema.member` = org membership (`role` owner/admin/member).
- `diagram-actions.ts`: `listProjects()`/`createProject(name)` use `requireActiveOrg()` + `ensureWorkspaceForOrg` (default ws); `renameProject`/`deleteProject`/`createDiagram`/`renameDiagram`/`deleteDiagram` authorize via `assertProjectAccess`/`assertDiagramAccess`. `ProjectWithDiagrams`.
- `app/page.tsx`: org+personal both render `<AppShell title="Dashboard"><DashboardOverview …/></AppShell>` from `getActiveContext()`+`getDashboardStats()`. `app/projects/page.tsx` renders `<ProjectsList …>` (org via `listProjects`, personal via `listPersonalProjects`).
- `app-shell.tsx`: `MAIN_NAV = [Dashboard "/", Projects "/projects", Catalog "/catalog"(orgOnly)]`; `NavLeaf` has `orgOnly?`; nav filtered by `isPersonal`.
- `components/projects-list.tsx`: folder listing, `context: "personal"|"org"` routes CRUD; `org-actions.ts` member-list pattern (org members by email/role).

**Parallelization:** mostly a pipeline (T1→T2→T3→T4) — each builds on the prior; reviews overlap the next implementer. Enum migration (T1) is generate-only. T3 and T4 both touch UI and T4's dialog is consumed by T3's pages, so they pipeline (one web editor at a time).

---

### Task 1: enum migration + role layer

**Files:** `packages/db/src/schema/app.ts`, `packages/db/drizzle/*` (generated), `apps/web/lib/tenancy.ts`, `apps/web/lib/tenancy.test.ts`

- [ ] **Step 1: enum** — in `app.ts`, change `workspaceRole` to include the new values (keep existing for back-compat):
```tsx
export const workspaceRole = pgEnum("workspace_role", ["admin", "editor", "viewer", "member"]);
```
(`member` retained for existing rows; treated as edit-capable in `canDo`.)

- [ ] **Step 2: generate migration** — `pnpm --filter @claril/db db:generate` → a migration that `ALTER TYPE "workspace_role" ADD VALUE 'editor'` / `'viewer'`. **Inspect**: additive only (Postgres `ADD VALUE`). If drizzle emits a destructive enum recreate, hand-write the additive `ALTER TYPE … ADD VALUE IF NOT EXISTS` SQL instead and report. Do NOT apply (Task 5).

- [ ] **Step 3: failing test** — `apps/web/lib/tenancy.test.ts` (append):
```tsx
import { canDo } from "./tenancy";
describe("canDo (workspace roles)", () => {
  it("viewer can only view", () => {
    expect(canDo("viewer", "view")).toBe(true);
    expect(canDo("viewer", "edit")).toBe(false);
    expect(canDo("viewer", "manage")).toBe(false);
  });
  it("editor (and legacy member) can view + edit, not manage", () => {
    for (const r of ["editor", "member"] as const) {
      expect(canDo(r, "view")).toBe(true);
      expect(canDo(r, "edit")).toBe(true);
      expect(canDo(r, "manage")).toBe(false);
    }
  });
  it("admin can do everything", () => {
    expect(canDo("admin", "view") && canDo("admin", "edit") && canDo("admin", "manage")).toBe(true);
  });
});
```

- [ ] **Step 4: implement** in `tenancy.ts`:
```tsx
export type WorkspaceRole = "admin" | "editor" | "viewer" | "member"; // "member" = legacy ≈ editor
export type WorkspaceAction = "view" | "edit" | "manage";

/** Pure capability check for a workspace role. */
export function canDo(role: WorkspaceRole, action: WorkspaceAction): boolean {
  if (action === "view") return true;
  if (action === "edit") return role === "admin" || role === "editor" || role === "member";
  return role === "admin"; // "manage"
}

/**
 * Resolve the user's effective role in a workspace and require at least `min`.
 * Org owners/admins are implicitly workspace admins. Throws "Not found" /
 * "Forbidden". Returns the effective role.
 */
export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  min: WorkspaceAction,
): Promise<WorkspaceRole> {
  const ws = (
    await db.select({ orgId: schema.workspace.organizationId })
      .from(schema.workspace).where(eq(schema.workspace.id, workspaceId)).limit(1)
  )[0];
  if (!ws) throw new Error("Not found");
  const orgRole = (
    await db.select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, ws.orgId), eq(schema.member.userId, userId)))
      .limit(1)
  )[0]?.role;
  if (orgRole === "owner" || orgRole === "admin") {
    if (!canDo("admin", min)) throw new Error("Forbidden");
    return "admin";
  }
  const wm = (
    await db.select({ role: schema.workspaceMember.role })
      .from(schema.workspaceMember)
      .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)))
      .limit(1)
  )[0];
  if (!wm) throw new Error("Forbidden");
  const role = wm.role as WorkspaceRole;
  if (!canDo(role, min)) throw new Error("Forbidden");
  return role;
}
```

- [ ] **Step 5: verify + commit** — `pnpm --filter @claril/db typecheck`; `cd apps/web && pnpm exec vitest run lib/tenancy.test.ts` → PASS; `pnpm --filter web typecheck` → PASS.
```bash
git add packages/db/src/schema/app.ts packages/db/drizzle apps/web/lib/tenancy.ts apps/web/lib/tenancy.test.ts
git commit -m "feat(db,web): workspace_role editor/viewer + canDo/requireWorkspaceRole role layer (W13 P4) …"
```

---

### Task 2: workspace + member actions; rescope project actions

**Files:** `apps/web/lib/workspace-actions.ts` (new), `apps/web/lib/diagram-actions.ts`

- [ ] **Step 1: `workspace-actions.ts`** (`"use server"`) — workspace CRUD + members. Use `requireUserId`, `requireActiveOrg` (org owner/admin gate for create via the active org), `requireWorkspaceRole` for per-workspace ops, `and`/`eq`/`count`, `randomUUID`. Key functions (mirror existing action style):
```tsx
export interface WorkspaceSummary {
  id: string; name: string; role: "admin" | "editor" | "viewer" | "member";
  projectCount: number; diagramCount: number;
}
export async function listWorkspaces(): Promise<WorkspaceSummary[]> { /* active org; workspaces the user is a member of, OR all if org owner/admin; join counts; role = ws member role or "admin" for org admins */ }
export async function createWorkspace(name: string): Promise<{ id: string }> {
  // org owner/admin only (requireActiveOrg + check member.role); insert workspace; add creator as workspaceMember role "admin".
}
export async function renameWorkspace(workspaceId: string, name: string): Promise<void> { await requireWorkspaceRole(userId, workspaceId, "manage"); /* update */ }
export async function deleteWorkspace(workspaceId: string): Promise<void> { await requireWorkspaceRole(userId, workspaceId, "manage"); /* delete (cascades projects/diagrams) */ }

export interface WorkspaceMemberView { userId: string; name: string; email: string; role: "admin"|"editor"|"viewer"|"member"; }
export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberView[]> { await requireWorkspaceRole(userId, workspaceId, "view"); /* join workspace_member × user */ }
export async function addWorkspaceMember(workspaceId: string, email: string, role: "admin"|"editor"|"viewer"): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, "manage");
  // resolve email → an existing ORG member (the workspace's org); throw if not an org member; upsert workspace_member (unique workspaceId,userId).
}
export async function removeWorkspaceMember(workspaceId: string, targetUserId: string): Promise<void> { await requireWorkspaceRole(userId, workspaceId, "manage"); /* delete */ }
export async function setWorkspaceMemberRole(workspaceId: string, targetUserId: string, role: "admin"|"editor"|"viewer"): Promise<void> { await requireWorkspaceRole(userId, workspaceId, "manage"); /* update */ }
```
Implement each fully (the implementer writes the bodies following the existing `actions.ts`/`org-actions.ts` query idioms; counts via `count()` grouped, email→user via `schema.user`, org-membership check via `schema.member`). `revalidatePath("/")` + the workspace path after mutations.

- [ ] **Step 2: rescope org project actions** in `diagram-actions.ts`:
  - `listProjects(workspaceId: string)` — `await requireWorkspaceRole(userId, workspaceId, "view")`; list projects where `workspaceId` (drop `ensureWorkspaceForOrg`).
  - `createProject(workspaceId: string, name: string)` — `requireWorkspaceRole(..., "edit")`; insert under `workspaceId`.
  - `renameProject`/`deleteProject` — after `assertProjectAccess` (which returns the workspaceId), add `requireWorkspaceRole(userId, workspaceId, "edit")`.
  - `createDiagram`/`renameDiagram`/`deleteDiagram` — these resolve the project's workspace via `assertProjectAccess`/`assertDiagramAccess` (org branch); add an `"edit"` role gate for org diagrams (personal diagrams keep owner-only — unaffected; `assertDiagramAccess` returns the discriminated kind, so gate only when `kind === "org"`).
  - Update the **callers**: `app/projects/page.tsx` org branch + `components/projects-list.tsx` (org create) now pass `workspaceId` (Task 3 wires the page; here just change signatures + fix the personal/`/projects` callers so the build stays green — personal path unaffected; the org `/projects` route is removed in Task 3, so temporarily the org branch of projects/page.tsx may break TS — coordinate: keep `listProjects`/`createProject` requiring `workspaceId` and update projects/page.tsx's ORG branch to redirect to `/` for now, finalized in Task 3).

- [ ] **Step 3: verify + commit** — `pnpm --filter web typecheck` → PASS (resolve all caller breakages — personal path intact; org `/projects` branch redirect-to-`/` stopgap until Task 3).
```bash
git add apps/web/lib/workspace-actions.ts apps/web/lib/diagram-actions.ts apps/web/app/projects/page.tsx
git commit -m "feat(web): workspace + member actions + workspaceId-scoped project actions with role gates (W13 P4) …"
```

---

### Task 3: WorkspacesGrid (org /) + workspace page + ProjectsList scoping

**Files:** `apps/web/components/workspaces-grid.tsx` (new), `apps/web/app/page.tsx`, `apps/web/app/w/[workspaceId]/page.tsx` (new), `apps/web/components/projects-list.tsx`, `apps/web/components/app-shell.tsx`

- [ ] **Step 1: scope-aware sidebar** (`app-shell.tsx`): add `personalOnly?: boolean` to `NavLeaf`; mark Projects `personalOnly: true`; org context hides Projects, personal hides Catalog (existing). Dashboard `/` stays for both.
- [ ] **Step 2: `WorkspacesGrid`** (`components/workspaces-grid.tsx`, client): props `{ workspaces: WorkspaceSummary[]; stats: DashboardStats }`. A slim stats strip (reuse a couple of `DashboardOverview` stat cards or a compact row) + a grid of workspace cards (name, counts, role badge, click → `/w/[id]`, overflow rename/delete/manage for `admin` role) + a **New workspace** dialog (`createWorkspace`). Empty state → CTA to create the first workspace.
- [ ] **Step 3: org `/` → WorkspacesGrid** (`app/page.tsx`): when `ctx.kind === "org"`, render `<AppShell title="Workspaces"><WorkspacesGrid workspaces={await listWorkspaces()} stats={safeStats} /></AppShell>`; personal branch unchanged (DashboardOverview).
- [ ] **Step 4: `/w/[workspaceId]` page** (`app/w/[workspaceId]/page.tsx`, server): auth gate; `const role = await requireWorkspaceRole(userId, workspaceId, "view")` (→ `notFound()`/redirect on throw); load `listProjects(workspaceId)` + workspace name; render `<AppShell title={wsName}>` with the projects folder list scoped to the workspace + a **Manage workspace** trigger (Task 4) shown when `canDo(role, "manage")`.
- [ ] **Step 5: `ProjectsList` scoping** — add optional `workspaceId?: string` + `readOnly?: boolean`. For org usage, create/rename/delete route to `createProject(workspaceId, …)`/`renameProject`/`deleteProject`; when `readOnly` (viewer), hide create/rename/delete + new-diagram affordances. Personal usage unchanged (no workspaceId, personal actions).
- [ ] **Step 6: finalize `/projects`** — for org context it now redirects to `/` (workspaces); personal keeps the folder list. (Or drop the org branch entirely.)
- [ ] **Step 7: verify + commit** — typecheck + build PASS (org `/` workspaces, `/w/[id]` projects, personal unchanged).
```bash
git add apps/web/components/workspaces-grid.tsx apps/web/app/page.tsx "apps/web/app/w/[workspaceId]/page.tsx" apps/web/components/projects-list.tsx apps/web/components/app-shell.tsx apps/web/app/projects/page.tsx
git commit -m "feat(web): org workspaces grid + /w/[id] projects page + scope-aware nav (W13 P4) …"
```

---

### Task 4: Manage-workspace dialog (members/roles/rename/delete)

**Files:** `apps/web/components/workspace-manage-dialog.tsx` (new), wired into `workspaces-grid.tsx` + `app/w/[workspaceId]/page.tsx`

- [ ] **Step 1: `WorkspaceManageDialog`** (client) — admin-gated; sections: rename (`renameWorkspace`), members table (`listWorkspaceMembers` → rows: name/email, role `Select` admin/editor/viewer via `setWorkspaceMemberRole`, remove via `removeWorkspaceMember`), add-member (email + role → `addWorkspaceMember`, must be an org member), and a delete-workspace confirm (`deleteWorkspace` → back to `/`). Reuse the shadcn `Dialog`/`Table`/`Select`/`Badge` patterns from `members-manager.tsx`; pending/error states; self/last-admin guards as sensible.
- [ ] **Step 2: wire it** into the workspaces-grid card overflow ("Manage") and the workspace page's Manage trigger (both admin-only).
- [ ] **Step 3: verify + commit** — typecheck + build PASS.
```bash
git add apps/web/components/workspace-manage-dialog.tsx apps/web/components/workspaces-grid.tsx "apps/web/app/w/[workspaceId]/page.tsx"
git commit -m "feat(web): manage-workspace dialog — members, roles, rename, delete (W13 P4) …"
```

---

### Task 5: Verify + migration + manual

- [ ] `pnpm --filter web typecheck` + `pnpm --filter @claril/db typecheck` + `pnpm --filter web build` + `cd apps/web && pnpm exec vitest run` → all PASS.
- [ ] **Apply the enum migration** (with explicit user authorization): `pnpm --filter @claril/db db:migrate` against prod. Additive `ADD VALUE` — confirm clean.
- [ ] **Manual matrix:** org `/` shows workspaces + create; `/w/[id]` shows its projects + diagrams; add a member as viewer (read-only) / editor (edits) / admin (manages); non-member can't open the workspace; rename/delete; the org default workspace still works; personal scope unchanged; drill org→workspace→project→diagram.

---

## Self-Review
- **Spec coverage:** enum + role layer (T1), workspace/member actions + rescoped projects (T2), grid + workspace page + nav (T3), manage dialog (T4), verify+migrate (T5). ✓
- **Placeholders:** T1 role layer + test are complete code; T2 gives full signatures + the exact gates/idioms to follow; T3/T4 give component structure + reuse points (members-manager/ProjectsList/shadcn).
- **Type consistency:** `WorkspaceRole`/`WorkspaceAction`/`canDo`/`requireWorkspaceRole` defined once (T1) and used in T2; `WorkspaceSummary`/`WorkspaceMemberView` in T2 consumed by T3/T4; `ProjectsList` gains optional `workspaceId`/`readOnly` (personal callers unaffected).
- **Invariants:** explicit-grant + org-admin override; every workspace/project/diagram mutation role-gated; additive migration (existing admin/member rows valid); personal scope + resolver + AI untouched; keys/secrets not involved.
- **Out of scope:** `project_member`/`project_role`, cross-workspace move, per-project roles.
