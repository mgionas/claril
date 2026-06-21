# W14 — shadcn Sidebar Shell (management pages) — Design Spec

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Scope:** Replace the top-bar `AppShell` with a shadcn collapsible-icon **sidebar shell** (sidebar-07 pattern) for the **authenticated management pages only** (dashboard, catalog, settings). The **diagram workbench** (`/d/[id]`) keeps its canvas-maximal `top-bar.tsx`; the **landing** is untouched.

## Why
The horizontal top bar doesn't scale as nav grows (settings sub-nav today; Org→Workspace→Project tree coming in W13 P4). A sidebar is the canonical home for the context switcher (header slot), nav groups, and the user menu (footer), and shadcn's block gives collapse/persistence, a mobile drawer, and keyboard toggle for free. Doing it now gives P4 workspaces a natural home.

## Current state (verified)
- `apps/web/components/app-shell.tsx` — top-bar `AppShell` (wordmark, `ContextSwitcher`, primary nav, `UserMenu`); props `{ children, userName, userEmail?, active?, actions?, fullBleed?, contentClassName? }`; hides Catalog in personal scope via `useSession().activeOrganizationId`.
- Consumers: `dashboard.tsx`, `app/catalog/{page,[assetId]/page,error,not-found}.tsx`, `app/settings/layout.tsx` → `components/settings/settings-shell.tsx` (an in-content sub-nav rail for Profile/Organization/Members/AI providers).
- shadcn configured (`components.json`: new-york, rsc, lucide). Only `ui/tooltip.tsx` of the sidebar deps exists today.

## Design

### Approach — keep the `AppShell` API, swap internals
Retain the `AppShell` component name + its props so consumers barely change; replace its body with the sidebar. (Rejected: a new `<SidebarShell>` + migrating every caller + deleting AppShell — pure churn.)

### 1. Add shadcn sidebar primitives
Install the sidebar block from the shadcn registry (`sidebar` + its deps: `sheet`, `skeleton`, `separator`, the `use-mobile` hook; `tooltip` exists). Map the block's `--sidebar-*` CSS variables to Claril's existing dark tokens in `app/globals.css` (so the sidebar inherits the canvas/panel/hairline/accent palette — no new colors).

### 2. Rebuild `AppShell` as a sidebar shell
`SidebarProvider` → `Sidebar collapsible="icon"` + `SidebarInset`:
- **SidebarHeader** — Claril wordmark + the existing **`ContextSwitcher`** (restyled for the header slot).
- **SidebarContent**:
  - A primary `SidebarGroup`: **Dashboard** (`/`), **Catalog** (`/catalog`, **org-only** — hidden in personal).
  - A **collapsible "Settings" group** (`Collapsible` + `SidebarMenuSub`): **Profile** (`/settings/profile`), **Organization** (`/settings/organization`, org-only), **Members** (`/settings/members`, org-only), **AI providers** (`/settings/ai`). Auto-open when the route is under `/settings`.
- **SidebarFooter** — the **user menu** (avatar + name/email + Sign out), reusing today's `UserMenu`.
- **SidebarInset** — a slim header: `SidebarTrigger` (collapse toggle) + the page title + the `actions` slot; then the content area (constrained `max-w-5xl` by default, or `fullBleed`, honoring `contentClassName`).
- **Active state** derived from `usePathname()` (robust for sub-items); the existing `active` prop stays accepted as an optional override.
- **Scope-awareness** reuses the current `useSession().activeOrganizationId` signal: Catalog / Organization / Members hidden in personal context.

### 3. Retire `SettingsShell`
The settings sub-nav now lives in the sidebar's Settings group. `app/settings/layout.tsx` wraps `children` directly in `<AppShell>` (resolving the session as today); delete `components/settings/settings-shell.tsx`; settings pages render their content directly (they already render only their own content). `SettingsHeader`/`SettingsCard`/etc. (`settings-ui.tsx`) are unaffected.

### Behavior
- **Collapsible to icons**, state **persisted** (shadcn cookie); default expanded. **Mobile** → Sheet drawer (provided). Keyboard toggle (⌘/ctrl-b) from the block.
- Workbench + landing unchanged.

## Components & boundaries
- `components/ui/sidebar.tsx` (+ sheet/skeleton/separator + `hooks/use-mobile`) — vendored shadcn primitives, themed via tokens.
- `components/app-shell.tsx` — same public API, sidebar internals. Reuses `ContextSwitcher` + `UserMenu` (extract `UserMenu` if it needs to move to the footer; keep it in app-shell).
- `app/settings/layout.tsx` — wraps children in `AppShell` directly; `settings-shell.tsx` deleted.
- No server/data/action changes. No new runtime dependency beyond the vendored shadcn files.

## Testing
Build + typecheck. Manual matrix: sidebar expand/collapse + persistence across reloads; mobile drawer; context switch re-scopes nav (Catalog/Org/Members hidden in personal); Settings group expands + each sub-page navigates with correct active highlight; dashboard/catalog render in the inset; actions slot (e.g. "New project") still works; workbench + landing unaffected; keyboard toggle + a11y (focus, aria-current, trigger label).

## Out of scope
Workbench chrome (`top-bar.tsx`), landing, the Org→Workspace→Project tree (W13 P4 will add it into this sidebar later), and any feature/data changes.

## Self-review
- **Placeholders:** none — install step, the sidebar composition, scope-gating, and SettingsShell retirement are concrete.
- **Consistency:** keeps the `AppShell` API (consumers unchanged) + reuses `ContextSwitcher`/`UserMenu` + the existing personal/org scope signal; tokens mapped, no new palette.
- **Scope:** management pages only; workbench/landing explicitly excluded; no feature work.
- **Ambiguity:** active state from `usePathname` (with `active` as override); settings nav lives ONLY in the sidebar (rail retired) — single source of truth.
