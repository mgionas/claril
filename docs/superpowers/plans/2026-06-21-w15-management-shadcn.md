# W15 — Management Surfaces on shadcn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split Dashboard (stats overview at `/`) from Projects (listing at `/projects`), and bring Dashboard/Projects/Catalog/Settings onto shadcn `card`/`table`/`chart`. Built on the W14 sidebar; workbench + landing untouched.

**Architecture:** Vendor shadcn `card`/`table`/`chart` (themed). A scope-aware `getDashboardStats` (pure aggregation extracted + unit-tested) feeds a new `DashboardOverview` at `/`; the current `dashboard.tsx` listing is refactored to `ProjectsList` (project cards + inner diagram table) at `/projects`. Catalog + Settings re-based on shadcn Card/Table. Same data/actions otherwise.

**Spec:** `docs/superpowers/specs/2026-06-21-w15-management-shadcn-design.md`.

**Verified facts:**
- shadcn vendored already (NO `card`/`table`/`chart` yet). `components.json`: new-york, rsc, lucide.
- `listProjects()`/`listPersonalProjects()` → `ProjectWithDiagrams[]` = `{ id, name, description, updatedAt, diagrams: { id, name, type:"bpmn"|"sequence"|"c4", updatedAt }[] }`.
- `getUsageSummary(orgId)` → `{ totalTokens, byProject: UsageRow[], byModel: UsageRow[] }`, `UsageRow = { label, inputTokens, outputTokens, totalTokens, calls }` (best-effort empty).
- `getActiveContext()` → `{kind:"personal";userId}|{kind:"org";orgId}|null`. `app/page.tsx` logged-in currently renders `<Dashboard projects context aiConnected userName userEmail>`.
- W14 `app-shell.tsx` `MAIN_NAV` = Dashboard `/`, Catalog `/catalog`(orgOnly).

**Parallelization:** **T1 ∥ T2** (disjoint: `ui/*`+globals vs `lib/*`). Then **T3** (needs T1+T2). Then **T4 / T5 / T6** each need T1 only and touch disjoint files — pipeline them one web-editor at a time with overlapping reviews. **T7** last.

---

### Task 1: Vendor + theme `card`, `table`, `chart`

**Files:** `apps/web/components/ui/{card,table,chart}.tsx` (+ deps), `apps/web/app/globals.css`, `package.json`/lockfile (recharts)

- [ ] **Step 1:** From `apps/web`: `pnpm dlx shadcn@latest add card table chart`. The `chart` block installs `recharts`. As in W14, DECLINE/restore any overwrite of a pre-existing themed component (`button`, `tooltip`, etc.); keep only the new files. Report what landed.
- [ ] **Step 2:** Theme the chart tokens in `globals.css`: map `--chart-1..5` to Claril accent + semantic colors (e.g. accent, info, success, warning, a muted), and ensure the shadcn `--color-chart-*` bridges exist in `@theme inline` (mirror the W14 sidebar token pattern). `card`/`table` use existing `--card`/`--border`/`--muted` bridges (already present) — verify they resolve to Claril tokens.
- [ ] **Step 3: Verify** — `pnpm --filter web typecheck` + `pnpm --filter web build` → PASS (nothing consumes them yet).
- [ ] **Step 4: Commit**
```bash
git add apps/web/components/ui apps/web/app/globals.css apps/web/package.json pnpm-lock.yaml apps/web/components.json
git commit -m "feat(web): vendor shadcn card/table/chart, themed to Claril tokens (W15) …"
```

---

### Task 2: `getDashboardStats` + pure aggregation

**Files:** `apps/web/lib/dashboard-stats.ts` (new), `apps/web/lib/dashboard-stats.test.ts` (new)

- [ ] **Step 1: Failing test** — `apps/web/lib/dashboard-stats.test.ts`:
```tsx
import { describe, expect, it } from "vitest";
import { aggregateStats } from "./dashboard-stats";

const proj = (name: string, diagrams: { id: string; name: string; type: "bpmn" | "sequence" | "c4"; updatedAt: string }[]) =>
  ({ id: name, name, description: null, updatedAt: "2026-06-01T00:00:00.000Z", diagrams });

describe("aggregateStats", () => {
  it("returns zeros for no projects", () => {
    expect(aggregateStats([])).toEqual({
      projectCount: 0, diagramCount: 0,
      diagramsByType: { bpmn: 0, sequence: 0, c4: 0 }, recent: [],
    });
  });
  it("counts projects + diagrams by type and surfaces recent (newest first, capped)", () => {
    const s = aggregateStats([
      proj("A", [
        { id: "d1", name: "Flow", type: "bpmn", updatedAt: "2026-06-02T00:00:00.000Z" },
        { id: "d2", name: "Seq", type: "sequence", updatedAt: "2026-06-05T00:00:00.000Z" },
      ]),
      proj("B", [{ id: "d3", name: "Ctx", type: "c4", updatedAt: "2026-06-03T00:00:00.000Z" }]),
    ]);
    expect(s.projectCount).toBe(2);
    expect(s.diagramCount).toBe(3);
    expect(s.diagramsByType).toEqual({ bpmn: 1, sequence: 1, c4: 1 });
    expect(s.recent.map((r) => r.id)).toEqual(["d2", "d3", "d1"]); // newest first
    expect(s.recent[0]).toMatchObject({ id: "d2", name: "Seq", type: "sequence", projectName: "A" });
  });
});
```

- [ ] **Step 2: Run; confirm FAIL.** `cd apps/web && pnpm exec vitest run lib/dashboard-stats.test.ts`.

- [ ] **Step 3: Implement** `apps/web/lib/dashboard-stats.ts`:
```tsx
"use server";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { getActiveContext } from "@/lib/context";
import { listProjects, type ProjectWithDiagrams } from "@/lib/diagram-actions";
import { listPersonalProjects } from "@/lib/personal-actions";
import { getUsageSummary, type UsageSummary } from "@/lib/ai-usage";
import { headers } from "next/headers";

export interface RecentDiagram {
  id: string; name: string; type: "bpmn" | "sequence" | "c4"; projectName: string; updatedAt: string;
}
export interface DashboardStatsCore {
  projectCount: number; diagramCount: number;
  diagramsByType: { bpmn: number; sequence: number; c4: number };
  recent: RecentDiagram[];
}
export interface DashboardStats extends DashboardStatsCore {
  scope: "personal" | "org";
  memberCount?: number;
  usage?: UsageSummary;
}

const RECENT_LIMIT = 6;

/** PURE: counts + by-type + recent (newest first, capped) from the scope's projects. */
export function aggregateStats(projects: ProjectWithDiagrams[]): DashboardStatsCore {
  const diagramsByType = { bpmn: 0, sequence: 0, c4: 0 };
  let diagramCount = 0;
  const all: RecentDiagram[] = [];
  for (const p of projects) {
    for (const d of p.diagrams) {
      diagramCount += 1;
      diagramsByType[d.type] += 1;
      all.push({ id: d.id, name: d.name, type: d.type, projectName: p.name, updatedAt: d.updatedAt });
    }
  }
  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { projectCount: projects.length, diagramCount, diagramsByType, recent: all.slice(0, RECENT_LIMIT) };
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (ctx.kind === "personal") {
    return { scope: "personal", ...aggregateStats(await listPersonalProjects()) };
  }
  const [core, usage, members] = await Promise.all([
    listProjects().then(aggregateStats),
    getUsageSummary(ctx.orgId),
    db.select({ n: count() }).from(schema.member).where(eq(schema.member.organizationId, ctx.orgId)),
  ]);
  return { scope: "org", ...core, usage, memberCount: members[0]?.n ?? 0 };
}
```
(Adjust imports to real exports; `count` from drizzle-orm. `headers` import only if needed — drop if unused.)

- [ ] **Step 4: Run test → PASS.** **Step 5: typecheck + commit** (`apps/web/lib/dashboard-stats.ts` + test).

---

### Task 3: Dashboard overview + nav split + `/projects` route shell

**Files:** `apps/web/components/dashboard-overview.tsx` (new), `apps/web/app/page.tsx`, `apps/web/app/projects/page.tsx` (new), `apps/web/components/app-shell.tsx`

- [ ] **Step 1: Add the Projects nav item** in `app-shell.tsx` `MAIN_NAV`: `{ label: "Projects", href: "/projects", icon: FolderKanban }` (after Dashboard). `isActive("/")` already exact-matches so Dashboard won't light up on `/projects`.
- [ ] **Step 2: `DashboardOverview`** (`components/dashboard-overview.tsx`, presentational) takes `DashboardStats` + `userName` + `aiConnected`. Render with shadcn `Card`:
  - Header: greeting + a primary "New project" / "New diagram" link to `/projects`.
  - **Stat cards** row: Projects (`projectCount`), Diagrams (`diagramCount` + a muted "B / S / C4" sub-line from `diagramsByType`), Members (org only, `memberCount`).
  - **AI usage** Card (org + `usage`): `totalTokens` + a compact `byModel` list (top few). (No cost field exists — show tokens + calls; if you want "est. cost", omit unless a price map exists — keep to tokens/calls to stay truthful.)
  - **Recent diagrams** shadcn `Table`: name (link `/d/[id]`), kind icon, project, relative time. Empty state when none.
  - **Chart** (shadcn `chart`): diagrams-by-type donut; org also a usage-by-model bar. Zero-data → a muted "No data yet".
  - Empty overall state (no projects) → friendly CTA to `/projects`.
- [ ] **Step 3: Route `/` to the overview** — rewrite `app/page.tsx` logged-in branch: resolve session + `getDashboardStats()` + `aiConnected` (via `getAiConfig(ctx)`); render `<DashboardOverview …>`. Keep the logged-out `<Landing/>`.
- [ ] **Step 4: `/projects` route shell** — `app/projects/page.tsx`: the exact data resolution `page.tsx` uses TODAY (session gate, `ctx`, `listProjects`/`listPersonalProjects`, `aiConnected`) → renders `<ProjectsList …>` (built in Task 4). Until Task 4 lands, it can temporarily render the existing `<Dashboard …>` so the route works; Task 4 swaps it.
- [ ] **Step 5: typecheck + build + commit.**

---

### Task 4: Projects listing → cards + inner diagram table

**Files:** `apps/web/components/projects-list.tsx` (new, refactor of `dashboard.tsx`), `apps/web/app/projects/page.tsx`, remove `apps/web/components/dashboard.tsx`

- [ ] **Step 1:** Create `components/projects-list.tsx` from `dashboard.tsx` (READ it first), restructured to **project cards + inner diagram table**: each project = shadcn `Card` (header: name + "New diagram" button + overflow `DropdownMenu` rename/delete); body = shadcn `Table` of its diagrams (name link `/d/[id]`, type chip via `Badge`, last-edited, row-action menu open/rename/delete). **Preserve every behavior** from `dashboard.tsx`: `context` prop routing (personal vs org actions), `NewDiagramDialog` (gated by `aiConnected`), create/rename/delete project+diagram, pending/error states, confirm dialogs, relative time. Friendly empty state.
- [ ] **Step 2:** Point `app/projects/page.tsx` at `<ProjectsList …>` (same props the Dashboard got). Delete `components/dashboard.tsx` (`git rm`); grep for any other importer of `Dashboard`/`dashboard` and update (should be only the old page.tsx, now using DashboardOverview).
- [ ] **Step 3: typecheck + build + commit.**

---

### Task 5: Catalog → shadcn

**Files:** `apps/web/components/catalog-admin.tsx`, `apps/web/components/catalog/asset-detail.tsx`

- [ ] **Step 1:** Refactor the `CatalogAdmin` asset listing to a shadcn `Table` (columns: name link → `/catalog/[id]`, type chip, key-field summary, usage `Badge`, row actions); keep the type filter (rail or a `Select`) and ALL CRUD (create/edit/delete asset + types, "Manage types"). Keep the personal "not available" gate (it's in `catalog/page.tsx`, untouched).
- [ ] **Step 2:** `asset-detail.tsx` sections → shadcn `Card` (fields card, "used in" card, references card); keep edit/delete + `field-value` rendering.
- [ ] **Step 3: typecheck + build + commit.**

---

### Task 6: Settings → shadcn

**Files:** `apps/web/components/settings/settings-ui.tsx`, `apps/web/components/settings/members-manager.tsx` (+ profile/org forms if needed)

- [ ] **Step 1:** Re-base `SettingsCard`/`SettingsHeader` on shadcn `Card` (`Card`/`CardHeader`/`CardTitle`/`CardContent`); keep their prop APIs so the pages don't change. `StatusBanner`/`Avatar`/`RoleBadge` stay (or use `Badge`).
- [ ] **Step 2:** `members-manager.tsx` member list → shadcn `Table` (member, role `Badge`/`Select`, actions); pending invitations → a second `Table`/section. Preserve all Better-Auth org behavior (invite/role/remove/cancel, owner-filtering, confirms).
- [ ] **Step 3:** Profile/org forms wrapped in `Card`s (inputs already shadcn). **Step 4: typecheck + build + commit.**

---

### Task 7: Verify + manual

- [ ] `pnpm --filter web typecheck` + `pnpm --filter web build` + `cd apps/web && pnpm exec vitest run` → all PASS.
- [ ] Manual: nav split (Dashboard `/` overview vs Projects `/projects` listing, correct active states); overview in org (cards + usage + recent + donut + bar) and personal (cards + recent + donut, no usage/members); recent links open `/d/[id]`; projects CRUD intact in both scopes; catalog list + detail render via shadcn with CRUD intact; settings cards + members table parity; charts handle zero data; **workbench `/d/[id]` + landing unchanged**.

---

## Self-Review
- **Spec coverage:** primitives (T1), stats data+pure agg (T2), overview+nav+routing (T3), projects refactor (T4), catalog (T5), settings (T6), verify (T7). ✓
- **Placeholders:** T2 data + pure aggregation have complete code/tests; UI tasks give the shadcn mapping + exact reuse/behavior-preservation notes (adapt to vendored APIs).
- **Type consistency:** `DashboardStats`/`RecentDiagram`/`aggregateStats` defined once in T2 and consumed by T3; `ProjectWithDiagrams` reused; `ProjectsList` keeps `dashboard.tsx`'s prop shape.
- **Truthfulness:** usage shows tokens/calls (no fabricated "cost" — no price data exists).
- **Risk notes:** `shadcn add` overwrite guard (T1); deleting `dashboard.tsx` after `/projects` works (T4); recharts new dep (chart).
- **Out of scope:** workbench, landing, time-series/health analytics.
