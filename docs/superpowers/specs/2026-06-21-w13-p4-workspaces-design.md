# W13 — Phase 4: Org Workspaces UI — Design Spec

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Builds on:** W13 P1/P2/P3 (tenancy + active context + personal AI), W14 (sidebar), W15 (dashboard/projects/folders on shadcn).
**Goal:** Make org **workspaces** first-class — an org has many workspaces, each with explicit-grant members + roles; drill **Org → Workspace → Projects → Diagrams** via dedicated pages. Personal scope is unchanged (flat, no workspaces).

## Current state (verified)
- Schema: `workspace` (org→workspace), `workspace_member` (`workspace_role` enum = **`["admin","member"]`** — needs `editor`/`viewer`), `project` (workspace→project). A vestigial `project_member`/`project_role` table exists but is **not** the enforcement path (`assertProjectAccess` checks `workspace_member`).
- Each org auto-gets **one** default workspace (`ensureWorkspaceForOrg`); org `listProjects`/`createProject` operate on that single default. No multi-workspace UI/selection/role management.
- `getActiveContext()` → personal | org. Sidebar `MAIN_NAV` = Dashboard `/`, Projects `/projects`, Catalog `/catalog`(orgOnly). Org `/` renders the W15 stats `DashboardOverview`; `/projects` the folder listing. `org-actions.ts` has the org member list pattern.

## Design

### 1. Routes & nav (scope-aware)
- **Org `/`** → a **WorkspacesGrid**: a slim org stats strip (reuse `getDashboardStats`) + a grid of **workspace cards** (name, project/diagram counts, your role, manage-overflow) + **New workspace**. Clicking a card → `/w/[workspaceId]`.
- **`/w/[workspaceId]`** (new) → that workspace's **Projects** (the W15 folder listing), access-gated to workspace members; a **Manage workspace** entry for admins. Project/diagram CRUD here, role-gated.
- **Personal `/`** → the W15 stats overview + projects (unchanged); `/projects` stays the personal folder listing.
- **Sidebar `MAIN_NAV` becomes scope-aware:** org → **Dashboard** (`/`, workspaces) · **Catalog** · Settings (drop the standalone "Projects" — org projects live under a workspace); personal → **Dashboard** (`/`) · **Projects** (`/projects`) · Settings. (The existing `orgOnly` filter pattern extends to a `personalOnly` for Projects.)

### 2. Schema — `workspace_role` enum (additive migration)
Add `editor` and `viewer` to `workspace_role` (keep `admin`; legacy `member` stays valid for existing rows — treated as `editor`-equivalent in `canDo`). Postgres `ALTER TYPE … ADD VALUE`. Generate-only; applied with authorization. No other schema change.

### 3. Backend (`lib/workspace-actions.ts` new + `tenancy.ts` + `diagram-actions.ts`)
- **Role model (pure, unit-tested):** `canDo(role, action)` where `action ∈ { "view", "edit", "manage" }` — `viewer`: view; `editor`/legacy `member`: view+edit; `admin`: view+edit+manage. `requireWorkspaceRole(userId, workspaceId, min)` resolves the user's `workspace_member.role` (or org owner/admin → implicit `admin`) and throws if `< min`.
- **Workspace CRUD** (org owner/admin): `createWorkspace(name)` (in the active org; creator added as workspace `admin`), `renameWorkspace(id, name)`, `deleteWorkspace(id)`. `listWorkspaces()` → workspaces the user can access (member of, OR all when org owner/admin), each with `{ id, name, role, projectCount, diagramCount }`.
- **Workspace members** (workspace `admin` or org owner/admin): `addWorkspaceMember(workspaceId, email, role)` (the email must resolve to an existing **org member**), `removeWorkspaceMember`, `setWorkspaceMemberRole`. `listWorkspaceMembers(workspaceId)`.
- **Rescope project actions** (`diagram-actions.ts`): org `listProjects`/`createProject` take an explicit **`workspaceId`** (from `/w/[id]`) instead of the default workspace; gate `createProject`/`createDiagram`/`renameProject`/`deleteProject`/`renameDiagram`/`deleteDiagram` on `requireWorkspaceRole(..., "edit")`; reads require `"view"`. Personal actions unchanged.

### 4. UI
- **WorkspacesGrid** (`components/workspaces-grid.tsx`) on org `/`: stat strip + workspace cards (shadcn `Card`) + create-workspace dialog; card overflow (rename/delete/manage) for admins.
- **Workspace page** (`app/w/[workspaceId]/page.tsx`): `AppShell` + the existing `ProjectsList` scoped to the workspace (pass `workspaceId`; viewers get a read-only variant — hide create/edit affordances) + a **Manage workspace** dialog trigger.
- **Manage-workspace dialog** (`components/workspace-manage-dialog.tsx`): rename/delete + members table (add by org-member email, role select admin/editor/viewer, remove) — admin-gated; reuses the shadcn `Table`/`Select`/`Dialog` patterns from the members manager.
- **Sidebar** scope-aware nav (org drops Projects; personal keeps it).
- `ProjectsList` gains an optional `workspaceId` + `readOnly` so it serves the org-workspace page (org create/rename/delete route to the workspace-scoped actions) while personal usage is unchanged.

### 5. Access & enforcement
Explicit-grant (P2): `listWorkspaces` shows only the user's workspaces (org owner/admin see all to manage). Every workspace/project/diagram action re-checks `requireWorkspaceRole`. The org's default workspace keeps the owner as `admin`.

## Components & boundaries
- `packages/db` — enum migration only.
- `tenancy.ts` — pure `canDo` + `requireWorkspaceRole` (+ unit tests).
- `workspace-actions.ts` (new) — workspace + member CRUD (role-gated).
- `diagram-actions.ts` — rescope org project actions to `workspaceId` + role gates.
- `app/page.tsx` (org branch → WorkspacesGrid), `app/w/[workspaceId]/page.tsx` (new), `components/{workspaces-grid,workspace-manage-dialog}.tsx` (new), `components/projects-list.tsx` (+`workspaceId`/`readOnly`), `app-shell.tsx` (scope-aware nav).
- No change to personal scope, resolver, or the AI subsystem.

## Testing
- **Unit:** pure `canDo` (viewer/editor/legacy-member/admin × view/edit/manage); the `listWorkspaces` aggregation if extracted.
- Build + typecheck; existing suites green.
- **Migration:** dry-run (additive enum values; existing `admin`/`member` rows valid).
- **Manual:** org `/` shows workspaces + create; open `/w/[id]` → projects + diagrams; add a member as `viewer` → they see read-only, `editor` → can edit, `admin` → can manage; non-member can't see the workspace; delete/rename; personal scope unchanged; drill org→ws→project→diagram.

## Out of scope
`project_member`/`project_role` (left as-is — not the enforcement path), cross-workspace project move, per-project roles, workspace invites for non-org-members.

## Self-review
- **Placeholders:** none — routes, enum migration, role model, action set, and UI components are concrete.
- **Consistency:** reuses `getActiveContext`/`requireActiveOrg`/`assertWorkspaceAccess`/`ProjectsList`/shadcn; explicit-grant from P2; additive migration; personal scope untouched.
- **Scope:** org workspaces only; `project_member` and cross-workspace moves deferred; the big surface is phased (backend → UI → verify).
- **Ambiguity:** `canDo` maps legacy `member`→edit; workspace creation is org-owner/admin only; org owners/admins implicitly `admin` on every workspace; org `/` = workspaces grid (+ stats strip), `/projects` is personal-only.
