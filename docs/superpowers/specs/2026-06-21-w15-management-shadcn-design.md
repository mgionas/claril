# W15 — Management Surfaces on shadcn — Design Spec

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Builds on:** W14 (sidebar shell + team-switcher). Workbench (`/d/[id]`) + landing untouched.
**Scope:** Split **Dashboard** (a stats overview) from **Projects** (the listing); build both with shadcn `card`/`table`/`chart`; and bring the **Catalog** and **Settings** pages onto shadcn primitives — one workstream across every management surface.

## Goal
The authenticated management area looks and behaves like a modern shadcn dashboard: `/` is an at-a-glance **overview** (stat cards, AI usage, recent diagrams, one chart), `/projects` is the **project/diagram listing** (project cards + inner diagram tables), and Catalog/Settings use shadcn `Card`/`Table` consistently — all inside the W14 sidebar inset.

## Current state (verified)
- Sidebar `AppShell` (W14): `MAIN_NAV = [Dashboard "/", Catalog "/catalog"(org-only)]` + collapsible Settings group; scope-aware via `useSession().activeOrganizationId`.
- `app/page.tsx` (logged-in) renders `<Dashboard projects context aiConnected …>` — the **project listing** (`components/dashboard.tsx`, ~662 lines: project cards + diagram rows, full CRUD, personal/org routing).
- Data: `listProjects()` / `listPersonalProjects()` → `ProjectWithDiagrams[]` (project + its diagrams). `getUsageSummary(orgId)` → `{ totalTokens, byProject: UsageRow[], byModel: UsageRow[] }` (org; best-effort, returns empty if table absent). No time-series.
- shadcn vendored so far: badge, button, collapsible, command, dialog, dropdown-menu, input, label, popover, scroll-area, select, separator, sheet, sidebar, skeleton, tabs, tooltip. **Missing: `card`, `table`, `chart`.**
- Catalog: `app/catalog/page.tsx` → `CatalogAdmin` (custom table-ish) + `catalog/[assetId]` `asset-detail.tsx`. Settings: `settings-ui.tsx` (`SettingsCard`/`SettingsHeader` custom), `members-manager.tsx` (custom list), profile/org forms.

## Design

### 1. Vendor + theme shadcn primitives
Add `card`, `table`, `chart` from the registry (chart pulls `recharts`). Theme to Claril tokens (the chart's `--chart-*` vars mapped to the accent/semantic palette), consistent with the W14 sidebar theming.

### 2. Nav + routing
- `MAIN_NAV` → **Dashboard** (`/`), **Projects** (`/projects`, new), **Catalog** (`/catalog`, org-only).
- `app/page.tsx`: logged-out → Landing (unchanged); logged-in `/` → new **`DashboardOverview`**.
- New `app/projects/page.tsx`: the listing (resolves context + projects exactly as `page.tsx` does today) → renders the refactored listing component.

### 3. Dashboard overview (`/`)
New server data action **`getDashboardStats(): Promise<DashboardStats>`** (scope-aware via `getActiveContext`): `{ scope, projectCount, diagramCount, diagramsByType: {bpmn,sequence,c4}, memberCount?, recent: RecentDiagram[], usage?: UsageSummary }`. Derives counts from the scope's projects+diagrams; `recent` = latest-edited diagrams (with id/name/type/projectName/updatedAt) for quick-open; `usage` only for org (`getUsageSummary`). Extract the **pure aggregation** (projects[] → counts/byType/recent) into a unit-testable function.
`DashboardOverview` (client/presentational) renders:
- **Stat cards** (shadcn `Card`): Projects, Diagrams (+ by-type sub-line), Members (org only).
- **AI usage** `Card` (org only): total tokens + estimated cost + a compact by-model/by-project list.
- **Recent diagrams** (shadcn `Table`): name + kind icon + project + last-edited, each linking to `/d/[id]`.
- **One chart** (shadcn `chart`): diagrams-by-type donut; orgs also get a usage-by-model bar. Empty/zero states handled.
- Personal scope: counts + recent + type donut; no usage/members.
- A primary **"New project"/"New diagram"** action (links to `/projects`) and empty-state CTA when there's nothing yet.

### 4. Projects page (`/projects`)
Refactor today's `dashboard.tsx` into **`ProjectsList`** using **project cards + inner diagram table**: each project = a shadcn `Card` (header: name + "New diagram" + overflow rename/delete); diagrams in a compact shadcn `Table` (name / type chip / last-edited / row actions → open, rename, delete). **Preserve all existing behavior**: create/rename/delete project + diagram, `NewDiagramDialog` (gated by `aiConnected`), personal/org context routing, pending/error handling, navigation. Friendly empty state. `components/dashboard.tsx` is replaced by `components/projects-list.tsx` (or renamed); update imports.

### 5. Catalog → shadcn
`CatalogAdmin` listing → shadcn `Table` for assets (name, type chip, key field summary, usage badge, row actions); keep the type filter (rail or a `Select`); `asset-detail.tsx` sections → shadcn `Card`. Preserve all CRUD + the personal "not available" gate (W13).

### 6. Settings → shadcn
`SettingsCard`/`SettingsHeader` (`settings-ui.tsx`) re-based on shadcn `Card`; `members-manager.tsx` member list → shadcn `Table`; profile/org forms keep their `Input`/`Label`/`Button` (already shadcn) inside `Card`s. Behavior unchanged (the W13/W8 actions stay).

## Components & boundaries
- `components/ui/{card,table,chart}.tsx` (+ recharts) — vendored, themed.
- `lib/dashboard-stats.ts` (or in an existing actions file) — `getDashboardStats` + the pure aggregation (unit-tested).
- `components/dashboard-overview.tsx` (new), `components/projects-list.tsx` (refactor of dashboard.tsx), `app/page.tsx` (route to overview), `app/projects/page.tsx` (new).
- `app-shell.tsx` — add the Projects nav item.
- Catalog: `catalog-admin.tsx` + `catalog/asset-detail.tsx`. Settings: `settings-ui.tsx` + `members-manager.tsx` (+ form components as needed).
- No server-action/data changes beyond adding `getDashboardStats`; no schema change.

## Testing
- **Unit:** the pure dashboard aggregation (projects[] → counts/byType/recent; empty input → zeros).
- Build + typecheck; existing web unit suites stay green.
- **Manual:** nav split (Dashboard vs Projects, active states); overview renders in org + personal (with/without usage); recent-diagram links open the workbench; projects CRUD intact (both scopes); catalog list + detail parity; settings cards/members table parity; charts render + handle zero data; workbench/landing unchanged.

## Phasing (the plan will sequence these; each independently verifiable)
1. Vendor + theme `card`/`table`/`chart`.
2. `getDashboardStats` + pure aggregation (+ test).
3. Dashboard overview + nav split + `/projects` route.
4. Projects listing refactor (cards + diagram table).
5. Catalog → shadcn.
6. Settings → shadcn.
7. Verify + manual.

## Out of scope
Workbench chrome, landing, time-series analytics (no data yet), live inspector "health" stats across diagrams (heavy — future), and W13 P3/P4 feature work.

## Self-review
- **Placeholders:** none — routes, the stats shape, per-surface shadcn mapping, and the data action are concrete.
- **Consistency:** reuses W14 sidebar + scope signal + existing actions; only adds `getDashboardStats`; tokens themed, no new palette (charts mapped to accent/semantic).
- **Scope:** every management surface, but workbench/landing excluded; phased for independent verification.
- **Ambiguity:** `/` = overview, `/projects` = listing (explicit); Dashboard content = cards + usage(org) + recent + one chart; Projects = card-per-project + inner diagram table; personal scope drops usage/members.
