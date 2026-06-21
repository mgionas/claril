# W13 — Phase 2: Context Switcher + Personal Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Personal vs Organization made real and switchable — active-context resolver, top-bar switcher, basic org creation, context-aware dashboards, required AI/catalog re-scoping, the `getDiagram` fix, and the legacy auto-"Personal"-org → personal-space migration.

**Architecture:** Two context notions — **active context** (session `activeOrganizationId`; scopes dashboard + new-creation) and **per-diagram context** (the diagram's parent; scopes an open diagram's AI/catalog). A new `context.ts` resolution layer; personal CRUD in `personal-actions.ts`; org flows re-scoped to the active org; the migration as a guarded idempotent TS routine.

**Spec:** `docs/superpowers/specs/2026-06-21-w13-phase2-context-switcher-design.md`.

**Verified facts:**
- `session.activeOrganizationId` exists (org plugin). `authClient` has `organizationClient()` → `authClient.organization.{list,setActive,create}`. `auth.api.getSession()` returns the session incl. `activeOrganizationId` (access as `session.session?.activeOrganizationId`).
- Phase 1 (committed): `schema.personalProject`/`userAiConnection`/`userAiDefault`; `diagram.projectId` nullable + `diagram.personalProjectId`; `getAiConfig(ctx)`, `getUserAiConfig`, `AiContext` in `ai.ts`; `assertDiagramAccess(userId, id): Promise<DiagramAccess>` (`{kind:"org",projectId,workspaceId}` | `{kind:"personal",personalProjectId}`), `assertPersonalProjectAccess`, `diagramParent` in `tenancy.ts`.
- `tenancy.ts` has `ensureUserWorkspace(userId)` (creates/returns the FIRST org's workspace); `assertProjectAccess(userId, projectId): Promise<workspaceId>`.
- `diagram-actions.ts` org flows use `ensureUserWorkspace`; `getDiagram` innerJoins on `diagram.projectId` (breaks for personal). `page.tsx` gates AI via `getOrgAiConfig(getUserOrgId(...))`.
- `vitest` alias `@/` configured (`apps/web/vitest.config.ts`).

**Parallelization:** T1 is the blocking core. After T1, **T2 / T5 / T6 are independent** (personal-actions.ts / catalog gating / migration routine) and can run in parallel; **T3** (re-scoping) and **T4** (switcher + dashboard) depend on T1 (+T2 for T4). T7 last.

---

### Task 1: Resolution layer (active context + per-diagram context + workspace-for-org + getDiagram fix)

**Files:** `apps/web/lib/context.ts` (new), `apps/web/lib/context.test.ts` (new), `apps/web/lib/tenancy.ts`, `apps/web/lib/ai.ts`, `apps/web/lib/diagram-actions.ts`

- [ ] **Step 1: Write failing tests** — `apps/web/lib/context.test.ts`:
```tsx
import { describe, expect, it } from "vitest";
import { resolveActiveContext } from "./context";

describe("resolveActiveContext", () => {
  const uid = "u1";
  it("falls back to personal when no active org is set", () => {
    expect(resolveActiveContext(uid, null, ["o1"])).toEqual({ kind: "personal", userId: uid });
  });
  it("uses the active org when the user is a member", () => {
    expect(resolveActiveContext(uid, "o1", ["o1", "o2"])).toEqual({ kind: "org", orgId: "o1" });
  });
  it("falls back to personal when the active org is no longer a membership", () => {
    expect(resolveActiveContext(uid, "gone", ["o1"])).toEqual({ kind: "personal", userId: uid });
  });
});
```

- [ ] **Step 2: Run; confirm FAIL** — `cd apps/web && pnpm exec vitest run lib/context.test.ts`.

- [ ] **Step 3: Implement `apps/web/lib/context.ts`**:
```tsx
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";

/** What the dashboard / new-creation scopes to. */
export type ActiveContext = { kind: "personal"; userId: string } | { kind: "org"; orgId: string };

/** Pure: choose the active context from the session's activeOrganizationId + the user's memberships. */
export function resolveActiveContext(
  userId: string,
  activeOrgId: string | null | undefined,
  memberOrgIds: string[],
): ActiveContext {
  if (activeOrgId && memberOrgIds.includes(activeOrgId)) {
    return { kind: "org", orgId: activeOrgId };
  }
  return { kind: "personal", userId };
}

/** Resolve the current user's active context (org or personal). */
export async function getActiveContext(): Promise<ActiveContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return null;
  const activeOrgId = session.session?.activeOrganizationId ?? null;
  const memberships = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId));
  return resolveActiveContext(
    userId,
    activeOrgId,
    memberships.map((m) => m.organizationId),
  );
}

/** Resolve the active context, requiring it to be an org (throws if personal). */
export async function requireActiveOrg(): Promise<{ userId: string; orgId: string }> {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Unauthorized");
  if (ctx.kind !== "org") throw new Error("No active organization.");
  const session = await auth.api.getSession({ headers: await headers() });
  return { userId: session!.user.id, orgId: ctx.orgId };
}
```

- [ ] **Step 4: `ensureWorkspaceForOrg` in `tenancy.ts`** — refactor the workspace-ensure logic so it works for ANY org (not just the first). Add:
```tsx
/** Get or create an org's default workspace and ensure the user is a member. Returns workspaceId. */
export async function ensureWorkspaceForOrg(userId: string, organizationId: string): Promise<string> {
  const existing = await db
    .select({ id: schema.workspace.id })
    .from(schema.workspace)
    .where(eq(schema.workspace.organizationId, organizationId))
    .orderBy(asc(schema.workspace.createdAt))
    .limit(1);
  let workspaceId = existing[0]?.id;
  if (!workspaceId) {
    workspaceId = randomUUID();
    await db.insert(schema.workspace).values({
      id: workspaceId,
      organizationId,
      name: "My Workspace",
      slug: "default",
    });
  }
  const member = await db
    .select({ id: schema.workspaceMember.id })
    .from(schema.workspaceMember)
    .where(
      and(
        eq(schema.workspaceMember.workspaceId, workspaceId),
        eq(schema.workspaceMember.userId, userId),
      ),
    )
    .limit(1);
  if (!member[0]) {
    await db
      .insert(schema.workspaceMember)
      .values({ id: randomUUID(), workspaceId, userId, role: "admin" });
  }
  return workspaceId;
}
```
(Ensure `randomUUID`, `asc`, `and`, `eq` are imported in `tenancy.ts`.)

- [ ] **Step 5: `diagramContext` in `ai.ts`** — map a diagram → its AI context (per-diagram rule):
```tsx
import { assertDiagramAccess } from "@/lib/tenancy"; // add if not present

/** Resolve an OPEN diagram's AI context from its parent (NOT the session's active context). */
export async function diagramContext(
  userId: string,
  diagramId: string,
): Promise<{ ctx: AiContext; orgId?: string }> {
  const access = await assertDiagramAccess(userId, diagramId);
  if (access.kind === "personal") {
    return { ctx: { kind: "personal", userId } };
  }
  const ws = await db
    .select({ organizationId: schema.workspace.organizationId })
    .from(schema.workspace)
    .where(eq(schema.workspace.id, access.workspaceId))
    .limit(1);
  const orgId = ws[0]!.organizationId;
  return { ctx: { kind: "org", orgId }, orgId };
}
```
(Watch for an import cycle ai.ts ↔ tenancy.ts; if it occurs, put `diagramContext` in `context.ts` instead and import `getAiConfig` there. Choose the placement that compiles cleanly and note it.)

- [ ] **Step 6: Fix `getDiagram`** in `diagram-actions.ts` — authorize via `assertDiagramAccess` and load regardless of parent:
```tsx
export async function getDiagram(diagramId: string): Promise<LoadedDiagram | null> {
  const userId = await requireUserId();
  try {
    await assertDiagramAccess(userId, diagramId); // throws if not found / forbidden
  } catch {
    return null;
  }
  const rows = await db
    .select({
      id: schema.diagram.id,
      name: schema.diagram.name,
      kind: schema.diagram.type,
      content: schema.diagram.content,
    })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 7: Verify + commit** — `cd apps/web && pnpm exec vitest run lib/context.test.ts lib/ai.test.ts lib/tenancy.test.ts` → PASS; `pnpm --filter web typecheck` → PASS.
```bash
git add apps/web/lib/context.ts apps/web/lib/context.test.ts apps/web/lib/tenancy.ts apps/web/lib/ai.ts apps/web/lib/diagram-actions.ts
git commit -m "feat(web): active-context + per-diagram-context resolution + getDiagram fix (W13 P2) …"
```

---

### Task 2: Personal project/diagram actions

**Files:** `apps/web/lib/personal-actions.ts` (new)

- [ ] **Step 1: Implement** `apps/web/lib/personal-actions.ts` — mirror `diagram-actions.ts` but on `personal_project` + `diagram.personalProjectId`, ownership-scoped:
```tsx
"use server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { assertPersonalProjectAccess, assertDiagramAccess } from "@/lib/tenancy";
import { defaultNameForKind, seedForKind, type DiagramKind } from "@/lib/default-diagram";
import type { ProjectWithDiagrams, DiagramSummary } from "@/lib/diagram-actions";

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

/** List the user's personal projects, each with its diagrams. */
export async function listPersonalProjects(): Promise<ProjectWithDiagrams[]> {
  const userId = await requireUserId();
  const projects = await db
    .select()
    .from(schema.personalProject)
    .where(eq(schema.personalProject.ownerUserId, userId))
    .orderBy(desc(schema.personalProject.updatedAt));
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);
  const diagrams = await db
    .select({
      id: schema.diagram.id,
      personalProjectId: schema.diagram.personalProjectId,
      name: schema.diagram.name,
      type: schema.diagram.type,
      updatedAt: schema.diagram.updatedAt,
    })
    .from(schema.diagram)
    .where(isNotNull(schema.diagram.personalProjectId))
    .orderBy(asc(schema.diagram.name));
  const byProject = new Map<string, DiagramSummary[]>();
  for (const d of diagrams) {
    if (!d.personalProjectId || !ids.includes(d.personalProjectId)) continue;
    const list = byProject.get(d.personalProjectId) ?? [];
    list.push({ id: d.id, name: d.name, type: d.type, updatedAt: d.updatedAt.toISOString() });
    byProject.set(d.personalProjectId, list);
  }
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    updatedAt: p.updatedAt.toISOString(),
    diagrams: byProject.get(p.id) ?? [],
  }));
}

export async function createPersonalProject(name: string): Promise<{ id: string }> {
  const userId = await requireUserId();
  const id = randomUUID();
  await db
    .insert(schema.personalProject)
    .values({ id, ownerUserId: userId, name: name.trim() || "Untitled project" });
  revalidatePath("/");
  return { id };
}

export async function renamePersonalProject(personalProjectId: string, name: string): Promise<void> {
  const userId = await requireUserId();
  await assertPersonalProjectAccess(userId, personalProjectId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  await db
    .update(schema.personalProject)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(schema.personalProject.id, personalProjectId));
  revalidatePath("/");
}

export async function deletePersonalProject(personalProjectId: string): Promise<void> {
  const userId = await requireUserId();
  await assertPersonalProjectAccess(userId, personalProjectId);
  await db.delete(schema.personalProject).where(eq(schema.personalProject.id, personalProjectId));
  revalidatePath("/");
}

export async function createPersonalDiagram(
  personalProjectId: string,
  kind: DiagramKind = "bpmn",
  name?: string,
  content?: string,
): Promise<{ id: string }> {
  const userId = await requireUserId();
  await assertPersonalProjectAccess(userId, personalProjectId);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.diagram).values({
      id,
      personalProjectId,
      type: kind,
      name: name?.trim() || defaultNameForKind(kind),
      content: content ?? seedForKind(kind),
    });
    await tx
      .update(schema.personalProject)
      .set({ updatedAt: new Date() })
      .where(eq(schema.personalProject.id, personalProjectId));
  });
  revalidatePath("/");
  return { id };
}
```
(`renameDiagram`/`deleteDiagram` from `diagram-actions.ts` already authorize via `assertDiagramAccess`, which now handles personal diagrams — so personal diagrams reuse them; no personal-specific rename/delete-diagram needed.)

- [ ] **Step 2: Verify + commit** — `pnpm --filter web typecheck` → PASS.
```bash
git add apps/web/lib/personal-actions.ts
git commit -m "feat(web): personal project/diagram server actions (W13 P2) …"
```

---

### Task 3: Re-scope org flows + AI/catalog to context

**Files:** `apps/web/lib/diagram-actions.ts`, `apps/web/lib/actions.ts`, `apps/web/app/api/ai/chat/route.ts`, `apps/web/lib/catalog-actions.ts`, `apps/web/app/page.tsx`, `apps/web/app/d/[diagramId]/page.tsx`

- [ ] **Step 1: Org data path → active org.** In `diagram-actions.ts`, replace `ensureUserWorkspace(userId)` in `listProjects` / `createProject` with the active org's workspace:
```tsx
import { requireActiveOrg } from "@/lib/context";
import { ensureWorkspaceForOrg } from "@/lib/tenancy";
// listProjects + createProject:
const { userId, orgId } = await requireActiveOrg();
const workspaceId = await ensureWorkspaceForOrg(userId, orgId);
```
(`createDiagram` keeps taking a `projectId` and authorizes via `assertProjectAccess` — unchanged; it's parent-correct already.) Remove the now-unused `ensureUserWorkspace` import if nothing else uses it (grep first).

- [ ] **Step 2: Advisor actions use the diagram's context.** In `actions.ts`, change `resolveAiContext(diagramId?, override?)` to derive config from the **diagram's** context when a `diagramId` is given, else the **active** context:
```tsx
import { diagramContext, getAiConfig } from "@/lib/ai";
import { getActiveContext } from "@/lib/context";
async function resolveAiContext(diagramId?: string, override?: AiOverride) {
  const userId = await requireUserId();
  let ctx; let orgId: string | undefined;
  if (diagramId) {
    const dc = await diagramContext(userId, diagramId);
    ctx = dc.ctx; orgId = dc.orgId;
  } else {
    const active = await getActiveContext();
    if (!active) throw new Error("No AI provider configured.");
    ctx = active; orgId = active.kind === "org" ? active.orgId : undefined;
  }
  const config = await getAiConfig(ctx, override);
  if (!config) throw new Error("No AI provider configured.");
  const assetContext = diagramId && orgId ? await buildDiagramAssetContext(orgId, diagramId) : undefined;
  const projectId = diagramId ? await projectIdForDiagram(diagramId) : null;
  return { config, assetContext, orgId: orgId ?? null, projectId };
}
```
Adjust the return shape's existing consumers (they use `config`, `assetContext`, `orgId`, `projectId`). Where `orgId` was assumed non-null for usage recording, allow null (personal). `runAdvisor` (which resolved `getOrgAiConfig(orgId)` directly) → route through the same diagram/active context logic. **Catalog grounding only when `orgId` is set** (personal → no asset context).

- [ ] **Step 3: Chat route → diagram context.** In `apps/web/app/api/ai/chat/route.ts`, replace `getUserOrgId` + `getOrgAiConfig(orgId)` with `diagramContext(userId, diagramId)` → `getAiConfig(ctx, override)`; build `assetContext` only for org diagrams (`orgId` set); record usage with `orgId` possibly null. Keep the 400 `"No AI provider configured."` guard. (The body already has `diagramId`.)

- [ ] **Step 4: Catalog actions → active org.** In `catalog-actions.ts`, the `requireOrg()` helper should resolve the **active** org (via `requireActiveOrg`) instead of `getUserOrgId` (first org), so catalog reads/writes scope to the active org. Personal context has no catalog (the page gates it — Task 5), but `requireOrg` throwing "No active organization." in personal context is the correct backstop.

- [ ] **Step 5: Dashboard + workbench AI gates.**
  - `page.tsx`: replace the `getOrgAiConfig(getUserOrgId)` gate with `getActiveContext()` → `getAiConfig(activeContext)` for the `aiConnected` flag (gates "Generate with AI" for new diagrams in the active context).
  - `d/[diagramId]/page.tsx`: gate the workbench's AI on the **diagram's** context: `diagramContext(userId, diagramId)` → `getAiConfig(ctx)`. (Find how it currently computes `aiConnected`/passes it to the workbench and swap the resolution.)

- [ ] **Step 6: Verify + commit** — `pnpm --filter web typecheck` + `pnpm --filter web build` → PASS; `cd apps/web && pnpm exec vitest run lib/ai.test.ts lib/context.test.ts lib/tenancy.test.ts` → PASS.
```bash
git add apps/web/lib/diagram-actions.ts apps/web/lib/actions.ts apps/web/app/api/ai/chat/route.ts apps/web/lib/catalog-actions.ts apps/web/app/page.tsx "apps/web/app/d/[diagramId]/page.tsx"
git commit -m "feat(web): re-scope org flows + AI/catalog to active/diagram context (W13 P2) …"
```

---

### Task 4: Context switcher + org creation + context-aware dashboard

**Files:** `apps/web/components/context-switcher.tsx` (new), `apps/web/components/app-shell.tsx`, `apps/web/app/page.tsx`, `apps/web/components/dashboard.tsx`, `apps/web/lib/org-actions.ts` (add `createOrgWithWorkspace`)

> READ `app-shell.tsx` (top-bar structure), `dashboard.tsx` (current props/actions), and how `authClient.organization` is used in `members-manager.tsx` for method patterns.

- [ ] **Step 1: `ContextSwitcher`** (`components/context-switcher.tsx`, `"use client"`) — top-left dropdown:
  - Props: `{ active: { kind: "personal" } | { kind: "org"; orgId: string; name: string }; orgs: { id: string; name: string }[] }` (server passes these from `getActiveContext` + `authClient.organization.list` equivalent — see Step 4).
  - Renders the current context label (Personal / org name) as the trigger; menu lists **Personal**, each org, and **+ Create organization**.
  - Switch handlers: org → `await authClient.organization.setActive({ organizationId })`; Personal → `await authClient.organization.setActive({ organizationId: null })`; then `router.refresh()`. (Verify the exact `setActive` null-clear signature in better-auth 1.6.20; if clearing isn't supported via `setActive`, add a tiny server action that nulls `session.activeOrganizationId`.)
  - **+ Create organization** opens a dialog (name) → a server action `createOrgWithWorkspace(name)` (Step 2) → `setActive(newOrgId)` → refresh.

- [ ] **Step 2: `createOrgWithWorkspace`** in `org-actions.ts`:
```tsx
export async function createOrgWithWorkspace(name: string): Promise<{ id: string }> {
  const userId = await requireUserId();
  const slug = `org-${randomUUID().slice(0, 8)}`;
  // Create via Better Auth so membership (owner) is set up correctly:
  const org = await auth.api.createOrganization({
    body: { name: name.trim() || "Organization", slug },
    headers: await headers(),
  });
  if (!org) throw new Error("Could not create organization.");
  await ensureWorkspaceForOrg(userId, org.id);
  return { id: org.id };
}
```
(Verify `auth.api.createOrganization` shape in better-auth 1.6.20; if the server API differs, call the client `authClient.organization.create` from the switcher instead and pass the new id to a `ensureWorkspaceForOrg` server action. Use whichever the installed version supports — confirm before coding.)

- [ ] **Step 3: Mount the switcher in `AppShell`** — add it top-left (before the nav). AppShell needs the data: add optional props `activeContext` + `orgs` and render `<ContextSwitcher .../>` when present. Each page that renders content through AppShell already passes `userName`; extend the call sites that matter (dashboard, catalog, settings) to also pass `activeContext`/`orgs` — OR have AppShell fetch via a small client hook using `authClient.useListOrganizations()` + `useSession()` (cleaner: keeps AppShell self-contained). Prefer the client-hook approach so every page gets the switcher without prop drilling; confirm `authClient` exposes a list-orgs hook, else pass props from each page.

- [ ] **Step 4: Context-aware dashboard.** In `page.tsx`:
```tsx
const ctx = await getActiveContext();
const projects = ctx?.kind === "org" ? await listProjects() : await listPersonalProjects();
const aiConnected = ctx ? Boolean(await getAiConfig(ctx)) : false;
return <Dashboard userName={...} userEmail={...} projects={projects} aiConnected={aiConnected} context={ctx?.kind ?? "personal"} />;
```
In `dashboard.tsx`: add `context: "personal" | "org"` prop. Route create/rename/delete to the right actions: personal → `createPersonalProject`/`renamePersonalProject`/`deletePersonalProject`/`createPersonalDiagram`; org → existing `createProject`/etc. (Import both sets; pick by `context`.) Adjust empty-state copy per context ("No personal projects yet" vs "No projects in {org} yet"). Keep all existing CRUD behavior + the NewDiagramDialog gating.

- [ ] **Step 5: Verify + commit** — typecheck + build PASS.
```bash
git add apps/web/components/context-switcher.tsx apps/web/components/app-shell.tsx apps/web/app/page.tsx apps/web/components/dashboard.tsx apps/web/lib/org-actions.ts
git commit -m "feat(web): top-bar context switcher + org creation + context-aware dashboard (W13 P2) …"
```

---

### Task 5: Catalog gating (personal has no catalog)

**Files:** `apps/web/components/app-shell.tsx`, `apps/web/app/catalog/page.tsx`

- [ ] **Step 1:** In `catalog/page.tsx`, resolve `getActiveContext()`; if **personal**, render an on-brand "Asset Catalog isn't available in your personal space — switch to an organization" state inside AppShell (with the switcher visible) instead of the catalog. If **org**, render the catalog scoped to the active org (catalog-actions already use the active org after Task 3 Step 4).
- [ ] **Step 2:** In `AppShell`, hide the **Catalog** nav item when the active context is personal (drive off the same `activeContext` the switcher uses).
- [ ] **Step 3: Verify + commit** — typecheck + build PASS.
```bash
git add apps/web/components/app-shell.tsx apps/web/app/catalog/page.tsx
git commit -m "feat(web): gate Asset Catalog to org context (hidden in Personal) (W13 P2) …"
```

---

### Task 6: Legacy migration — auto-"Personal" org → personal space

**Files:** `packages/db/src/migrate-personal-orgs.ts` (new — pure mapping + runner), `packages/db/src/migrate-personal-orgs.test.ts` (new), `packages/db/package.json` (script)

> A guarded, idempotent, transactional TS routine (not SQL) — testable and safe.

- [ ] **Step 1: Write failing test** for the pure qualifier — `migrate-personal-orgs.test.ts`:
```tsx
import { describe, expect, it } from "vitest";
import { qualifiesAsAutoPersonalOrg } from "./migrate-personal-orgs";

describe("qualifiesAsAutoPersonalOrg", () => {
  it("qualifies a single-owner org named Personal", () => {
    expect(qualifiesAsAutoPersonalOrg({ name: "Personal", members: [{ userId: "u1", role: "owner" }] })).toBe(true);
  });
  it("rejects multi-member orgs", () => {
    expect(qualifiesAsAutoPersonalOrg({ name: "Personal", members: [{ userId: "u1", role: "owner" }, { userId: "u2", role: "member" }] })).toBe(false);
  });
  it("rejects orgs not named Personal", () => {
    expect(qualifiesAsAutoPersonalOrg({ name: "Acme", members: [{ userId: "u1", role: "owner" }] })).toBe(false);
  });
});
```

- [ ] **Step 2: Implement** `packages/db/src/migrate-personal-orgs.ts`:
  - Export the pure `qualifiesAsAutoPersonalOrg(org): boolean` (`org.name === "Personal" && org.members.length === 1 && org.members[0].role === "owner"`).
  - Export `async function migratePersonalOrgs(): Promise<{ orgsMigrated: number; projectsMoved: number }>` that, for each qualifying org, in a single `db.transaction`: for each project in the org's workspaces, insert a `personal_project` (ownerUserId = the owner, name/description copied), `UPDATE diagram SET personal_project_id = <pp>, project_id = NULL WHERE project_id = <project>`; copy `ai_connection` rows → `user_ai_connection` (userId = owner) and `ai_org_default` → `user_ai_default`; then `DELETE` the organization (cascades workspace/project/member/ai_connection/ai_org_default). Idempotent: after running, no qualifying orgs remain, so a re-run migrates 0. Log a summary. Reads `DATABASE_URL` from env like the other db tooling.
  - Add a `db:migrate-personal` script to `packages/db/package.json` (e.g. `"db:migrate-personal": "tsx src/migrate-personal-orgs.ts"`; if `tsx` isn't a dep, use the existing TS runner the repo uses — check `drizzle.config.ts`/devDeps; `tsx` is commonly present, else add it as a devDep).
  - The file's `main`-guard runs `migratePersonalOrgs()` when executed directly.

- [ ] **Step 3: Run test; confirm PASS** — `pnpm --filter @claril/db exec vitest run src/migrate-personal-orgs.test.ts` (add `vitest` devDep/config to the db package if absent — mirror how `logic-inspector` runs vitest).

- [ ] **Step 4: Verify + commit** (do NOT run the migration against prod yet — Task 7):
```bash
git add packages/db/src/migrate-personal-orgs.ts packages/db/src/migrate-personal-orgs.test.ts packages/db/package.json
git commit -m "feat(db): idempotent legacy auto-Personal-org → personal-space migration routine (W13 P2) …"
```

---

### Task 7: Verify, run migration, manual

**Files:** none.

- [ ] **Step 1: Full verification** — `pnpm --filter web typecheck`, `pnpm --filter @claril/db typecheck`, `pnpm --filter web build`, `pnpm -r test`, and the web unit suites → all PASS.
- [ ] **Step 2: Dry-run the migration on a copy / staging** if available; otherwise carefully review the routine. Then **with explicit user authorization**, run `pnpm --filter @claril/db db:migrate-personal` against prod. Confirm the summary (orgs migrated, projects moved) and that multi-member orgs were untouched.
- [ ] **Step 3: Manual matrix** — switch Personal↔org re-scopes dashboard/catalog/AI; create org → default workspace → create project/diagram; existing work now appears under **Personal** (post-migration); open a personal diagram (loads; personal AI → "No AI provider configured" CTA); open an org diagram (org AI + catalog intact); Catalog hidden in Personal.

---

## Self-Review
- **Spec coverage:** active-context + per-diagram context + getDiagram (T1), personal CRUD (T2), re-scoping AI/catalog/org-data (T3), switcher + org creation + dashboard (T4), catalog gating (T5), legacy migration (T6), verify+run (T7). ✓
- **Placeholders:** backend code complete; UI/integration tasks give exact signatures + the two-context rule + adaptation notes (verify the better-auth `setActive(null)` / `createOrganization` server-API shapes before coding — flagged inline).
- **Type consistency:** `ActiveContext`/`AiContext` reused; `resolveActiveContext`/`qualifiesAsAutoPersonalOrg` signatures match their tests; `diagramContext` returns `{ctx, orgId?}` consumed identically in actions + chat route.
- **Correctness invariants:** dashboard/new-creation = active context; open-diagram AI/catalog = diagram context (no cross-context leak); catalog org-only; migration idempotent + multi-member-safe + transactional; personal AI correct-but-off until P3.
- **Deferred:** personal AI settings UI (P3), full workspaces UI + `workspaceRole` (P4).
