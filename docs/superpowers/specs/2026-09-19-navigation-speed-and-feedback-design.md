# W20 — Navigation speed & action feedback

status: approved design · date: 2026-09-19

## Problem

Clicking around the signed-in app feels stuck: after a nav click or a create/rename/delete, the screen does not change for a noticeable time and the user cannot tell whether anything is happening. Audit findings:

1. **Session is never cached.** Better Auth has no `cookieCache`, and `requireUserId()` (53 call sites) plus `lib/context.ts` each call `auth.api.getSession()` — a DB round-trip every time, repeated within one request.
2. **Pages are serial waterfalls.** `/d/[diagramId]` awaits ~7 things in sequence (session → diagram → context → AI config → doc → chat → role); `/`, `/projects`, `/w/[id]`, `/workspaces` follow the same pattern.
3. **No feedback layer.** No route has a `loading.tsx`, so the old page stays frozen until the new one's data resolves (only the thin top loader moves). There is no toast system. Several mutations end their pending state before the follow-up `router.push`/`router.refresh()` finishes, leaving a dead gap.
4. **The sidebar is not in a layout.** Every page renders its own `<AppShell>`, so a naive `loading.tsx` would blank the whole screen, sidebar included.

## Goals

- A click produces visible feedback immediately (clicked-link spinner, then a content skeleton) with the sidebar staying put.
- Pages reach first byte faster by removing redundant session lookups and serial awaits.
- Every mutation in scope shows pending until the resulting UI is on screen, then a success or error signal.

## Non-goals

- Feedback for AI operations (chat, proposals, review, doc-gen) and canvas operations (save, export, restore, quick-fix). Follow-up workstream.
- Caching data across requests (`use cache`, ISR) — out of scope; only per-request dedupe here.
- Changing the Vercel function region (will be measured and reported, not changed).

## Design

### 1. Persistent shell + skeletons

**Route group.** Move signed-in management routes under `app/(app)/` (URLs unchanged):
`/` (page.tsx), `/projects`, `/workspaces`, `/w/[workspaceId]`, `/catalog`, `/catalog/[assetId]`, `/settings/**`.
`/docs`, `/sign-in`, `/sign-up`, `/d/[diagramId]` stay outside the group.

**`app/(app)/layout.tsx`** (server): reads the session once via `getCurrentSession()`.
- Signed in → renders the frame (today's `AppShell`: `SidebarProvider`, `AppSidebar`, header with `SidebarTrigger`, title, `ThemeToggle`, `NotificationBell`) around `children`.
- Signed out → renders `children` bare. Only `/` handles this (it returns `<Landing />`); every other page in the group keeps its own `redirect("/sign-in")` guard, since layouts do not re-run on client navigation and must not be the only auth check.

**Header title.** A client `HeaderTitle` in the frame derives the title from the pathname (`/`→Dashboard, `/projects`→Projects, `/workspaces`→Workspaces, `/w/*`→Workspace, `/catalog*`→Catalog, `/settings*`→Settings). Pages can override it with a client `<PageHeader title={…} actions={…} />` that writes both into a small React context the frame's header reads, and clears them on unmount. `/w/[workspaceId]` uses it for the workspace name and its `WorkspaceManageButton` (the only current `actions` user). The unused `fullBleed`/`contentClassName` props are removed.

**Cleanup.** Pages drop their `<AppShell>` wrappers. `app/settings/layout.tsx` (moved to `app/(app)/settings/layout.tsx`) stops rendering a shell and keeps only its `redirect("/sign-in")` guard. `AppShell` is reduced to the layout frame.

**Skeletons.** One `loading.tsx` per content route, composed from `components/ui/skeleton.tsx`, mirroring the real layout so content does not jump:

| Route | Skeleton |
|---|---|
| `/` | 4 stat cards · 2 chart cards · recent-diagrams list |
| `/projects` | folder rows |
| `/workspaces` | card grid |
| `/w/[workspaceId]` | heading + folder rows |
| `/catalog` | table header + rows |
| `/catalog/[assetId]` | heading + field card |
| `/settings/*` | form cards |
| `/d/[diagramId]` | full-screen workbench: top bar, empty canvas with centered spinner + "Opening diagram…", collapsed drawer |

**Clicked-link spinner.** A `NavLinkPending` child using Next's `useLinkStatus` renders a small spinner inside sidebar items and project/diagram/workspace links while that navigation is pending. `nextjs-toploader` stays.

### 2. Speed

1. **`getCurrentSession()`** in `lib/session.ts`: `cache(() => auth.api.getSession({ headers: await headers() }))` (React `cache`, per-request). `requireUserId()`, `lib/context.ts`, `invitation-actions.ts` and all pages/layouts use it; no other code calls `auth.api.getSession` directly.
2. **Better Auth cookie cache**: `session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }` in `lib/auth.ts`. Accepted trade-off: a revoked session can remain valid up to 5 minutes. **Must verify** that `setActiveOrganization` refreshes the cached cookie so the org switcher does not read a stale `activeOrganizationId`; if it does not, the switch path reads the session with `query: { disableCookieCache: true }`.
3. **Per-request memoization**: wrap `getActiveContext` and `getAiConfig` in React `cache()` (the latter decrypts a key; layout + page may both need it).
4. **Parallelize independent awaits**:
   - `/d/[diagramId]`: session → diagram → `Promise.all([ aiConfig→doc, getChatMessages, canResolveComments ])`.
   - `/`: after session+ctx, `Promise.all([getDashboardStats(), getAiConfig(ctx)])`.
   - `/projects`, `/w/[workspaceId]`, `/workspaces`: same treatment for their independent calls.
5. **Measure**: record TTFB for `/`, `/projects`, `/d/[id]` on a Vercel preview before and after; check the function region vs the Neon region and report.

### 3. Action feedback

1. **Pending lasts until the new UI is on screen.** `router.push`/`router.refresh()` move *inside* the same `startTransition` as the mutation. Creates that navigate keep the dialog open with a "Creating…" button until the destination's skeleton takes over (project create, diagram create → `/d/[id]`, workspace create → `/w/[id]`, org create).
2. **Toasts.** Add shadcn `sonner` (`components/ui/sonner.tsx`) with `<Toaster>` in the root layout, themed with the design tokens and following next-themes.
3. **`runAction`** in `lib/action-feedback.ts`:
   ```ts
   runAction<T>(fn: () => Promise<T>, msgs: { loading?: string; success?: string; error?: string }): Promise<T | undefined>
   ```
   - Shows a loading toast only if `fn` is still running after 400 ms (no flash for fast ops), then replaces it with success/error.
   - Re-throws Next control-flow errors (`NEXT_REDIRECT`, `NEXT_NOT_FOUND` — detected via `isRedirectError`/`isNotFoundError` or the `digest` prefix) untouched, so expired-session redirects keep working.
   - Other errors → error toast using the existing `errorMessage()`; returns `undefined`.
   - Inline field-validation errors stay inline; toasts report operation outcomes.
4. **`Button` `loading` prop** in `components/ui/button.tsx`: renders `Loader2` spinner, sets `disabled` and `aria-busy`. Adopted by the buttons touched in this work.
5. **Flows in scope**: project create/rename/delete; diagram create/rename/delete; workspace create/rename/delete + member add/role/remove; org switch + create; settings forms (profile, organization, password, members); catalog asset create/delete.

## Testing

- **Unit (Vitest)**: `runAction` — no toast under 400 ms, loading→success over 400 ms, error mapping, redirect/not-found passthrough. `HeaderTitle` pathname mapping (pure function).
- **Regression**: `pnpm typecheck` + `pnpm test` green (CI).
- **Manual (Vercel preview, DevTools Slow 4G)**: every sidebar nav shows link spinner → skeleton with sidebar intact; `/` logged out still shows the landing; each in-scope flow shows spinner → toast → updated UI; org switch shows the new org's data; expired session on an action still redirects to `/sign-in`.

## Risks

- **Route-group move** touches ~8 pages; pure file moves + wrapper removal, URLs unchanged. Watch relative imports and `not-found`/`error` files under `catalog/` (move with it).
- **Cookie cache staleness** on org switch — explicitly verified (§2.2).
- **Layout not re-running on client nav** — mitigated by keeping per-page auth guards.
