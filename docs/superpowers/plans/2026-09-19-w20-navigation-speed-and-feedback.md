# W20 — Navigation Speed & Action Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a nav link or running a create/rename/delete gives immediate, continuous feedback (sidebar stays, skeleton appears, spinner until the new UI is on screen, then a toast), and pages reach first byte faster.

**Architecture:** Move signed-in management routes into an `app/(app)` route group whose layout renders the sidebar frame once, so each route's `loading.tsx` skeleton swaps only the content area. Cache the session per request (React `cache`) and in a signed cookie (Better Auth `cookieCache`), and parallelize independent page queries. Add `sonner` toasts, a tested `runAction` helper, a `Button loading` prop, and re-wrap post-`await` state updates in `startTransition` so pending lasts through navigation.

**Tech Stack:** Next.js 16 App Router, React 19, Better Auth 1.6, Drizzle/postgres.js, shadcn/ui, Tailwind 4, sonner 2, Vitest 4.

Spec: `docs/superpowers/specs/2026-09-19-navigation-speed-and-feedback-design.md`

## Global Constraints

- Node 24 locally (`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`); pnpm 11.5.
- URLs must not change. `/docs`, `/sign-in`, `/sign-up`, `/d/[diagramId]` stay outside the `(app)` group.
- Every page in the group keeps its own `redirect("/sign-in")` guard (layouts don't re-run on client navigation). Only `/` renders `<Landing />` when signed out.
- Cookie cache: `session.cookieCache = { enabled: true, maxAge: 5 * 60 }`.
- Loading toast delay: **400 ms**.
- AI and canvas operations (chat, proposals, save, export, restore, quick-fix) are **out of scope**.
- Commits and PRs: plain messages under the user's identity — **no `Co-Authored-By` trailer, no "Generated with Claude Code" footer**.
- Use the latest stable dependency versions (verify with `npm view <pkg> version`).
- Gates after every task: `pnpm typecheck` and `pnpm test` from the repo root must pass.

## File map

| File | Responsibility |
|---|---|
| `apps/web/lib/page-title.ts` (+ `.test.ts`) | Pure `titleForPath(pathname)` |
| `apps/web/components/page-header.tsx` | `PageHeaderProvider`, `usePageHeader`, `<PageHeader title actions>` (client context) |
| `apps/web/components/app-shell.tsx` | Frame only: sidebar + header (title from context/pathname) + `<main>` |
| `apps/web/components/nav-link-pending.tsx` | `useLinkStatus` spinner shown inside a pending `<Link>` |
| `apps/web/app/(app)/layout.tsx` | Session once → frame, or bare children when signed out |
| `apps/web/app/(app)/**/loading.tsx` | Per-route content skeletons |
| `apps/web/app/d/[diagramId]/loading.tsx` | Full-screen workbench skeleton |
| `apps/web/components/skeletons.tsx` | Shared skeleton building blocks |
| `apps/web/lib/session.ts` | `getCurrentSession` (per-request cached) + `requireUserId` |
| `apps/web/lib/action-feedback.ts` (+ `.test.ts`) | `runAction`, `isNextControlError`, `errorMessage` |
| `apps/web/components/ui/sonner.tsx` | Themed `<Toaster>` |
| `apps/web/components/ui/button.tsx` | + `loading` prop |

---

### Task 1: Enable web unit tests in CI + page-title mapping

The web app has 9 passing Vitest files (56 tests) but no `test` script, so turbo/CI never run them.

**Files:**
- Modify: `apps/web/package.json` (scripts)
- Create: `apps/web/lib/page-title.ts`
- Test: `apps/web/lib/page-title.test.ts`

**Interfaces:**
- Produces: `titleForPath(pathname: string): string`

- [ ] **Step 1: Add the test script**

In `apps/web/package.json` `scripts`, add after `"typecheck"`:

```json
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
```

- [ ] **Step 2: Write the failing test** — `apps/web/lib/page-title.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { titleForPath } from "@/lib/page-title";

describe("titleForPath", () => {
  it.each([
    ["/", "Dashboard"],
    ["/projects", "Projects"],
    ["/workspaces", "Workspaces"],
    ["/w/abc123", "Workspace"],
    ["/catalog", "Catalog"],
    ["/catalog/asset_1", "Catalog"],
    ["/settings", "Settings"],
    ["/settings/ai", "Settings"],
    ["/something-else", ""],
  ])("%s → %s", (path, title) => {
    expect(titleForPath(path)).toBe(title);
  });

  it("does not match prefixes that are not path segments", () => {
    expect(titleForPath("/projectsx")).toBe("");
    expect(titleForPath("/catalogue")).toBe("");
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`Cannot find module '@/lib/page-title'`)

Run: `pnpm --filter web exec vitest run lib/page-title.test.ts`

- [ ] **Step 4: Implement** — `apps/web/lib/page-title.ts`

```ts
/** Default header title for a signed-in management route. Pages can override it via <PageHeader>. */
const SECTIONS: Array<[prefix: string, title: string]> = [
  ["/projects", "Projects"],
  ["/workspaces", "Workspaces"],
  ["/w", "Workspace"],
  ["/catalog", "Catalog"],
  ["/settings", "Settings"],
];

export function titleForPath(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  for (const [prefix, title] of SECTIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return title;
  }
  return "";
}
```

- [ ] **Step 5: Run web tests — expect PASS** (10 files)

Run: `pnpm --filter web test`

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/lib/page-title.ts apps/web/lib/page-title.test.ts
git commit -m "test(web): run web unit tests in CI; add titleForPath"
```

---

### Task 2: Persistent shell via `(app)` route group

**Files:**
- Create: `apps/web/components/page-header.tsx`
- Modify: `apps/web/components/app-shell.tsx`
- Create: `apps/web/app/(app)/layout.tsx`
- Move (git mv): `app/page.tsx`, `app/projects/`, `app/workspaces/`, `app/w/`, `app/catalog/` (incl. `error.tsx`, `not-found.tsx`, `[assetId]/`), `app/settings/` → `app/(app)/…`
- Modify: every moved page that renders `<AppShell>`; `app/(app)/settings/layout.tsx`

**Interfaces:**
- Consumes: `titleForPath` (Task 1)
- Produces: `AppShell({ userName, userEmail, children })`; `PageHeader({ title?: string; actions?: ReactNode })`

- [ ] **Step 1: Page header context** — `apps/web/components/page-header.tsx`

```tsx
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface PageHeaderState {
  title?: string;
  actions?: ReactNode;
}

const PageHeaderContext = createContext<{
  header: PageHeaderState | null;
  setHeader: (h: PageHeaderState | null) => void;
} | null>(null);

/** Holds the per-page header override (title/actions) for the persistent app frame. */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState | null>(null);
  return (
    <PageHeaderContext.Provider value={{ header, setHeader }}>{children}</PageHeaderContext.Provider>
  );
}

export function usePageHeader(): PageHeaderState | null {
  return useContext(PageHeaderContext)?.header ?? null;
}

/**
 * Rendered by a page to override the frame header's title and/or right-aligned
 * actions. Clears itself on unmount so the next route falls back to its default.
 */
export function PageHeader({ title, actions }: PageHeaderState) {
  const ctx = useContext(PageHeaderContext);
  const setHeader = ctx?.setHeader;
  useEffect(() => {
    if (!setHeader) return;
    setHeader({ title, actions });
    return () => setHeader(null);
  }, [setHeader, title, actions]);
  return null;
}
```

- [ ] **Step 2: Reduce `AppShell` to the frame** — in `apps/web/components/app-shell.tsx`

Replace the `AppShellSection` type, the `AppShellProps` interface and the `AppShell` function with:

```tsx
export interface AppShellProps {
  children: ReactNode;
  /** Display name for the user menu. */
  userName: string;
  /** Optional email shown under the name in the user menu. */
  userEmail?: string;
}

/**
 * Persistent frame for Claril's signed-in management pages, rendered once by
 * `app/(app)/layout.tsx`: collapsible sidebar + sticky header + content area.
 * It stays mounted across navigations so only the content area swaps (to the
 * route's loading.tsx skeleton, then the page). Pages override the header via <PageHeader>.
 */
export function AppShell({ children, userName, userEmail }: AppShellProps) {
  return (
    <PageHeaderProvider>
      <SidebarProvider>
        <AppSidebar userName={userName} userEmail={userEmail} />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-hairline bg-canvas/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <HeaderTitle />
            <div className="ml-auto flex items-center gap-2">
              <HeaderActions />
              <ThemeToggle />
              {/* Shown for everyone — personal accounts still receive org invitations. */}
              <NotificationBell />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </PageHeaderProvider>
  );
}

function HeaderTitle() {
  const pathname = usePathname();
  const title = usePageHeader()?.title ?? titleForPath(pathname);
  if (!title) return null;
  return <span className="truncate text-sm font-semibold tracking-tight">{title}</span>;
}

function HeaderActions() {
  return <>{usePageHeader()?.actions}</>;
}
```

Add imports: `import { PageHeaderProvider, usePageHeader } from "@/components/page-header";` and `import { titleForPath } from "@/lib/page-title";`. Remove the now-unused `cn` import if nothing else uses it (check with typecheck).

- [ ] **Step 3: Move routes into the group**

```bash
cd apps/web/app
mkdir "(app)"
git mv page.tsx "(app)/page.tsx"
git mv projects workspaces w catalog settings "(app)/"
```

- [ ] **Step 4: Group layout** — `apps/web/app/(app)/layout.tsx`

```tsx
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

/**
 * Persistent frame for signed-in management routes. Signed-out visitors get the
 * bare page (only `/` renders for them — the landing; every other page redirects
 * to /sign-in in its own guard, which must stay because layouts don't re-run on
 * client navigation).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return <>{children}</>;
  return (
    <AppShell userName={session.user.name} userEmail={session.user.email}>
      {children}
    </AppShell>
  );
}
```

(Task 5 switches this to `getCurrentSession()`.)

- [ ] **Step 5: Strip `<AppShell>` from pages**

For each file below, delete the `AppShell` import and replace `<AppShell …>X</AppShell>` with `X` (wrap in `<>…</>` if needed):
- `app/(app)/page.tsx` → returns `<DashboardOverview … />`
- `app/(app)/projects/page.tsx` → returns `<ProjectsList … />`
- `app/(app)/workspaces/page.tsx` → returns `<WorkspacesGrid … />`
- `app/(app)/catalog/page.tsx` (both returns) → the empty-state `<div>` / `<CatalogAdmin … />`
- `app/(app)/catalog/[assetId]/page.tsx` → returns `<AssetDetail … />`

`app/(app)/w/[workspaceId]/page.tsx` return becomes:

```tsx
  return (
    <>
      <PageHeader
        title={ws.name}
        actions={
          canManage ? (
            <WorkspaceManageButton workspaceId={workspaceId} workspaceName={ws.name} />
          ) : undefined
        }
      />
      <ProjectsList
        context="org"
        workspaceId={workspaceId}
        projects={projects}
        aiConnected={aiConnected}
        readOnly={readOnly}
      />
    </>
  );
```

with `import { PageHeader } from "@/components/page-header";`.

`app/(app)/settings/layout.tsx` becomes guard-only:

```tsx
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");
  return <>{children}</>;
}
```

Then confirm nothing else imports removed props:

Run: `grep -rn "<AppShell\|AppShellSection\|fullBleed" apps/web/app apps/web/components`
Expected: only `app/(app)/layout.tsx` and `components/app-shell.tsx`.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm test` → PASS. Then `pnpm --filter web build` → succeeds and the route table still lists `/`, `/projects`, `/workspaces`, `/w/[workspaceId]`, `/catalog`, `/catalog/[assetId]`, `/settings/*`.

- [ ] **Step 7: Manual check** (`pnpm dev`): signed out `/` shows the landing with no sidebar; signed in, clicking between Dashboard → Projects → Settings keeps the sidebar mounted (collapse state persists); `/w/[id]` shows the workspace name + Manage button in the header.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/app apps/web/components/app-shell.tsx apps/web/components/page-header.tsx
git commit -m "feat(web): persistent app shell via (app) route group"
```

---

### Task 3: Route skeletons

**Files:**
- Modify: `apps/web/components/ui/skeleton.tsx` (color)
- Create: `apps/web/components/skeletons.tsx`
- Create: `app/(app)/loading.tsx`, `app/(app)/projects/loading.tsx`, `app/(app)/workspaces/loading.tsx`, `app/(app)/w/[workspaceId]/loading.tsx`, `app/(app)/catalog/loading.tsx`, `app/(app)/catalog/[assetId]/loading.tsx`, `app/(app)/settings/loading.tsx`, `app/d/[diagramId]/loading.tsx`

**Interfaces:**
- Produces: `StatCardsSkeleton`, `CardSkeleton`, `ListRowsSkeleton({ rows })`, `HeadingSkeleton`

- [ ] **Step 1: Fix skeleton color** — `bg-accent` is the brand blue in this design system, so skeletons would pulse blue. In `components/ui/skeleton.tsx` change the class to:

```tsx
      className={cn("animate-pulse rounded-md bg-muted", className)}
```

- [ ] **Step 2: Building blocks** — `apps/web/components/skeletons.tsx`

```tsx
import { Skeleton } from "@/components/ui/skeleton";

/** Page title + subtitle placeholder. */
export function HeadingSkeleton() {
  return (
    <div className="mb-6 flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-[10px]" />
      ))}
    </div>
  );
}

export function CardSkeleton({ className = "h-48" }: { className?: string }) {
  return <Skeleton className={`rounded-[10px] ${className}`} aria-hidden />;
}

export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-[8px]" />
      ))}
    </div>
  );
}

/** Screen-reader announcement shared by every loading.tsx. */
export function LoadingStatus({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Route loading files** (each is a default-exported server component rendered inside the persistent frame's `<main>`):

`app/(app)/loading.tsx` (Dashboard — also the fallback for any group route without its own):

```tsx
import { CardSkeleton, HeadingSkeleton, ListRowsSkeleton, LoadingStatus, StatCardsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingStatus label="Loading dashboard" />
      <HeadingSkeleton />
      <StatCardsSkeleton />
      <div className="grid gap-4 md:grid-cols-2">
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-64" />
      </div>
      <ListRowsSkeleton rows={4} />
    </div>
  );
}
```

`app/(app)/projects/loading.tsx` and `app/(app)/w/[workspaceId]/loading.tsx`:

```tsx
import { HeadingSkeleton, ListRowsSkeleton, LoadingStatus } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <LoadingStatus label="Loading projects" />
      <HeadingSkeleton />
      <ListRowsSkeleton rows={6} />
    </div>
  );
}
```

`app/(app)/workspaces/loading.tsx`:

```tsx
import { CardSkeleton, HeadingSkeleton, LoadingStatus } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <LoadingStatus label="Loading workspaces" />
      <HeadingSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}
```

`app/(app)/catalog/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { HeadingSkeleton, ListRowsSkeleton, LoadingStatus } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <LoadingStatus label="Loading catalog" />
      <HeadingSkeleton />
      <Skeleton className="mb-2 h-9 w-full rounded-[8px]" aria-hidden />
      <ListRowsSkeleton rows={8} />
    </div>
  );
}
```

`app/(app)/catalog/[assetId]/loading.tsx` and `app/(app)/settings/loading.tsx`:

```tsx
import { CardSkeleton, HeadingSkeleton, LoadingStatus } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingStatus label="Loading" />
      <HeadingSkeleton />
      <CardSkeleton className="h-56" />
      <CardSkeleton className="h-40" />
    </div>
  );
}
```

`app/d/[diagramId]/loading.tsx` (outside the frame — full screen):

```tsx
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline px-4" aria-hidden>
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-48" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center" role="status">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="size-4 animate-spin" />
          Opening diagram…
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify** — `pnpm typecheck`. Manual (`pnpm dev`, DevTools → Network → Slow 4G): each sidebar click shows the matching skeleton immediately with the sidebar intact; opening a diagram shows "Opening diagram…".

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/skeleton.tsx apps/web/components/skeletons.tsx apps/web/app
git commit -m "feat(web): route loading skeletons"
```

---

### Task 4: Clicked-link spinner

**Files:**
- Create: `apps/web/components/nav-link-pending.tsx`
- Modify: `apps/web/components/app-shell.tsx` (main + settings nav links)

**Interfaces:**
- Produces: `<NavLinkPending />` — must be rendered as a descendant of a `next/link` `<Link>`.

- [ ] **Step 1: Component** — `apps/web/components/nav-link-pending.tsx`

```tsx
"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

/** Small spinner shown inside a <Link> while its navigation is pending. */
export function NavLinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className="ml-auto size-3.5 animate-spin text-fg-muted" aria-label="Loading" />;
}
```

- [ ] **Step 2: Use it in the sidebar** — in `AppSidebar`, add `<NavLinkPending />` as the last child of both `<Link>`s:

```tsx
                  <Link href={item.href} aria-current={isActive(item.href) ? "page" : undefined}>
                    <item.icon />
                    <span>{item.label}</span>
                    <NavLinkPending />
                  </Link>
```

```tsx
                          <Link
                            href={item.href}
                            aria-current={isActive(item.href) ? "page" : undefined}
                          >
                            <span>{item.label}</span>
                            <NavLinkPending />
                          </Link>
```

- [ ] **Step 3: Use it on diagram links** — find the diagram/workspace `<Link>`s:

Run: `grep -n "<Link" apps/web/components/projects-list.tsx apps/web/components/workspaces-grid.tsx apps/web/components/dashboard-overview.tsx`

Add `<NavLinkPending />` as the last child of each `<Link href={\`/d/…\`}>` and `<Link href={\`/w/…\`}>`.

- [ ] **Step 4: Verify** — `pnpm typecheck`; manual on Slow 4G: the clicked item shows the spinner until the skeleton appears.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components
git commit -m "feat(web): show pending spinner on clicked nav links"
```

---

### Task 5: Per-request session cache + cookie cache

**Files:**
- Modify: `apps/web/lib/session.ts`, `apps/web/lib/auth.ts`, `apps/web/lib/context.ts`, `apps/web/lib/invitation-actions.ts`, `apps/web/lib/ai.ts`
- Modify: every `app/**` file calling `auth.api.getSession`

**Interfaces:**
- Produces: `getCurrentSession(): Promise<Session | null>` (React-`cache`d); `getActiveContext` becomes cached (same signature); `getAiConfigFor(ctx: ActiveContext): Promise<LLMProviderConfig | null>` (cached per `kind:id`).

- [ ] **Step 1: `lib/session.ts`**

```ts
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * The current session, looked up at most once per request (React `cache`) and
 * served from Better Auth's signed cookie cache when fresh. Every server-side
 * session read goes through here.
 */
export const getCurrentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/**
 * Resolve the current user id, or redirect to the sign-in page when there is no
 * valid session (e.g. it expired while a page was open). Redirecting — rather
 * than throwing — means an expired session bounces the user to login instead of
 * surfacing a raw "Unauthorized" error from a server action.
 *
 * IMPORTANT: redirect() throws the NEXT_REDIRECT control-flow signal — never
 * call this inside a try/catch that swallows errors, or the redirect is lost.
 */
export async function requireUserId(): Promise<string> {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/sign-in");
  return session.user.id;
}
```

- [ ] **Step 2: Cookie cache** — in `lib/auth.ts` add to the `betterAuth({...})` options, after `emailAndPassword`:

```ts
  // Serve session reads from a signed cookie for 5 minutes instead of a DB
  // round-trip per call. Trade-off: a revoked session stays valid ≤5 min.
  // Org switching (organization/set-active) rewrites this cookie, so the
  // active org is never stale.
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
```

- [ ] **Step 3: `lib/context.ts`** — replace both `auth.api.getSession({ headers: await headers() })` calls with `getCurrentSession()`, wrap `getActiveContext` in `cache`, and drop the `headers`/`auth` imports:

```ts
import { cache } from "react";
import { getCurrentSession } from "@/lib/session";
// …
export const getActiveContext = cache(async (): Promise<ActiveContext | null> => {
  const session = await getCurrentSession();
  // …body unchanged…
});
```

- [ ] **Step 4: `lib/invitation-actions.ts:25`** → `const session = await getCurrentSession();` (import from `@/lib/session`).

- [ ] **Step 5: Cached AI config** — in `lib/ai.ts`, below `getAiConfig`:

```ts
const getAiConfigByKey = cache((kind: "personal" | "org", id: string) =>
  getAiConfig(kind === "personal" ? { kind, userId: id } : { kind, orgId: id }),
);

/** Per-request memoized `getAiConfig` for page renders (no per-run override). */
export function getAiConfigFor(ctx: AiContext): Promise<LLMProviderConfig | null> {
  return ctx.kind === "personal"
    ? getAiConfigByKey("personal", ctx.userId)
    : getAiConfigByKey("org", ctx.orgId);
}
```

(add `import { cache } from "react";`). If `AiContext`'s members are not exactly `{kind:"personal";userId}` / `{kind:"org";orgId}`, adapt the two object literals to its actual shape.

- [ ] **Step 6: Pages and layouts** — replace every `auth.api.getSession({ headers: await headers() })` in `apps/web/app/**` with `getCurrentSession()` and every page-level `getAiConfig(ctx)` with `getAiConfigFor(ctx)`:

Run: `grep -rln "auth.api.getSession" apps/web/app apps/web/lib`
Expected after the change: only `apps/web/lib/session.ts`.

- [ ] **Step 7: Verify** — `pnpm typecheck && pnpm test`. Manual: sign in, switch Personal → an org → Personal via the switcher; each switch shows that scope's data immediately (proves the cookie cache is refreshed). Sign out → protected pages redirect to `/sign-in`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib apps/web/app
git commit -m "perf(web): per-request session cache + Better Auth cookie cache"
```

---

### Task 6: Parallelize page queries

**Files:**
- Modify: `app/d/[diagramId]/page.tsx`, `app/(app)/page.tsx`, `app/(app)/projects/page.tsx`, `app/(app)/w/[workspaceId]/page.tsx`

- [ ] **Step 1: Diagram page** — replace the body after `notFound()` in `app/d/[diagramId]/page.tsx`:

```tsx
  // AI for an open diagram reflects THAT diagram's context: an org diagram uses
  // its org's AI, a personal diagram uses the user's personal AI.
  const { ctx } = await diagramContext(session.user.id, diagram.id);

  // Independent reads run together.
  const [aiConfig, initialChatMessages, canResolveComments] = await Promise.all([
    getAiConfigFor(ctx),
    getChatMessages(diagram.id),
    resolveCanResolveComments(session.user.id, diagram.id, ctx.kind),
  ]);
  const initialDoc = aiConfig ? await getDiagramDoc(diagram.id) : null;
```

and add below the component:

```tsx
/**
 * Comments are available in both scopes. On a personal diagram the solo owner
 * can resolve their own threads; on org diagrams editors+ can resolve any
 * thread (resolved from the viewer's workspace role). The server enforces both.
 */
async function resolveCanResolveComments(
  userId: string,
  diagramId: string,
  kind: "personal" | "org",
): Promise<boolean> {
  if (kind === "personal") return true;
  try {
    const access = await assertDiagramAccess(userId, diagramId);
    if (access.kind !== "org") return false;
    const role = await requireWorkspaceRole(userId, access.workspaceId, "view");
    return canDo(role, "edit");
  } catch {
    return false;
  }
}
```

Remove the old `let canResolveComments …` block.

- [ ] **Step 2: Dashboard** — in `app/(app)/page.tsx`:

```tsx
  const ctx = await getActiveContext();
  const [stats, aiConfig] = await Promise.all([
    getDashboardStats(),
    ctx ? getAiConfigFor(ctx) : Promise.resolve(null),
  ]);
  const aiConnected = Boolean(aiConfig);
```

- [ ] **Step 3: Projects** — in `app/(app)/projects/page.tsx`, after the org redirect:

```tsx
  const [projects, aiConfig] = await Promise.all([
    listPersonalProjects(),
    ctx ? getAiConfigFor(ctx) : Promise.resolve(null),
  ]);
  const aiConnected = Boolean(aiConfig);
```

- [ ] **Step 4: Workspace** — in `app/(app)/w/[workspaceId]/page.tsx`, run the role check and workspace row together, then projects + AI together:

```tsx
  const [role, ws] = await Promise.all([
    requireWorkspaceRole(userId, workspaceId, "view").catch(() => null),
    db
      .select({ name: schema.workspace.name, orgId: schema.workspace.organizationId })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, workspaceId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!role || !ws) notFound();

  const [projects, aiConfig] = await Promise.all([
    listProjects(workspaceId),
    getAiConfigFor({ kind: "org", orgId: ws.orgId }),
  ]);
  const aiConnected = Boolean(aiConfig);
```

(The name is only rendered after the role check passes, so fetching it in parallel does not leak existence across tenants.)

- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm test`; manual: dashboard, projects, a workspace and a diagram all render the same data as before.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app
git commit -m "perf(web): parallelize independent page queries"
```

---

### Task 7: Toasts, `runAction`, `Button loading`

**Files:**
- Modify: `apps/web/package.json` (add `sonner`)
- Create: `apps/web/components/ui/sonner.tsx`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/lib/action-feedback.ts`
- Test: `apps/web/lib/action-feedback.test.ts`
- Modify: `apps/web/components/ui/button.tsx`

**Interfaces:**
- Produces:
  - `errorMessage(err: unknown): string`
  - `isNextControlError(err: unknown): boolean`
  - `LOADING_TOAST_DELAY_MS = 400`
  - `interface Notifier { loading(msg: string): string | number; success(msg: string, opts?: { id?: string | number }): void; error(msg: string, opts?: { id?: string | number; description?: string }): void; dismiss(id: string | number): void }`
  - `runAction<T>(fn: () => Promise<T>, msgs?: { loading?: string; success?: string; error?: string }, notify?: Notifier): Promise<T | undefined>`
  - `Button` accepts `loading?: boolean`

- [ ] **Step 1: Install**

Run: `npm view sonner version` (expect ≥ 2.0.8), then `pnpm --filter web add sonner@<that version>`.

- [ ] **Step 2: Write the failing tests** — `apps/web/lib/action-feedback.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOADING_TOAST_DELAY_MS,
  errorMessage,
  isNextControlError,
  runAction,
  type Notifier,
} from "@/lib/action-feedback";

function fakeNotifier() {
  return {
    loading: vi.fn(() => "t1"),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  } satisfies Notifier;
}

const later = <T,>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("runAction", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("skips the loading toast for fast actions", async () => {
    const n = fakeNotifier();
    const p = runAction(() => later(100, 42), { loading: "Saving…", success: "Saved" }, n);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(42);
    expect(n.loading).not.toHaveBeenCalled();
    expect(n.success).toHaveBeenCalledWith("Saved", { id: undefined });
  });

  it("shows loading after the delay, then replaces it with success", async () => {
    const n = fakeNotifier();
    const p = runAction(() => later(1000, "ok"), { loading: "Saving…", success: "Saved" }, n);
    await vi.advanceTimersByTimeAsync(LOADING_TOAST_DELAY_MS);
    expect(n.loading).toHaveBeenCalledWith("Saving…");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe("ok");
    expect(n.success).toHaveBeenCalledWith("Saved", { id: "t1" });
  });

  it("dismisses a shown loading toast when there is no success message", async () => {
    const n = fakeNotifier();
    const p = runAction(() => later(1000, 1), { loading: "Working…" }, n);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(n.dismiss).toHaveBeenCalledWith("t1");
    expect(n.success).not.toHaveBeenCalled();
  });

  it("reports errors and resolves undefined", async () => {
    const n = fakeNotifier();
    const p = runAction(() => Promise.reject(new Error("boom")), { error: "Could not save" }, n);
    await expect(p).resolves.toBeUndefined();
    expect(n.error).toHaveBeenCalledWith("Could not save", { id: undefined, description: "boom" });
  });

  it("rethrows Next redirect / not-found signals untouched", async () => {
    const n = fakeNotifier();
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/sign-in;307;",
    });
    await expect(runAction(() => Promise.reject(redirect), {}, n)).rejects.toBe(redirect);
    expect(n.error).not.toHaveBeenCalled();
  });
});

describe("isNextControlError", () => {
  it.each([
    [{ digest: "NEXT_REDIRECT;push;/x;307;" }, true],
    [{ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }, true],
    [{ digest: "NEXT_NOT_FOUND" }, true],
    [new Error("nope"), false],
    [{ digest: 123 }, false],
    [null, false],
  ])("%o → %s", (err, expected) => {
    expect(isNextControlError(err)).toBe(expected);
  });
});

describe("errorMessage", () => {
  it("reads Error, string, and falls back", () => {
    expect(errorMessage(new Error("a"))).toBe("a");
    expect(errorMessage("b")).toBe("b");
    expect(errorMessage({})).toBe("Something went wrong.");
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (module not found)

Run: `pnpm --filter web exec vitest run lib/action-feedback.test.ts`

- [ ] **Step 4: Implement** — `apps/web/lib/action-feedback.ts`

```ts
import { toast } from "sonner";

/** Delay before a loading toast appears, so fast actions don't flash one. */
export const LOADING_TOAST_DELAY_MS = 400;

export interface Notifier {
  loading(msg: string): string | number;
  success(msg: string, opts?: { id?: string | number }): void;
  error(msg: string, opts?: { id?: string | number; description?: string }): void;
  dismiss(id: string | number): void;
}

const sonnerNotifier: Notifier = {
  loading: (msg) => toast.loading(msg),
  success: (msg, opts) => void toast.success(msg, opts),
  error: (msg, opts) => void toast.error(msg, opts),
  dismiss: (id) => void toast.dismiss(id),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong.";
}

/**
 * Next.js signals redirect()/notFound() by throwing errors with a well-known
 * `digest`. They must propagate untouched (e.g. an expired session redirecting
 * to /sign-in), never be shown as a failure toast.
 */
export function isNextControlError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const digest = (err as { digest: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
      digest === "NEXT_NOT_FOUND")
  );
}

/**
 * Run a mutation with toast feedback: a loading toast if it takes longer than
 * LOADING_TOAST_DELAY_MS, then success (or dismissal) / error. Errors resolve to
 * `undefined` after being reported; Next control-flow errors are rethrown.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  msgs: { loading?: string; success?: string; error?: string } = {},
  notify: Notifier = sonnerNotifier,
): Promise<T | undefined> {
  let id: string | number | undefined;
  const timer = msgs.loading
    ? setTimeout(() => {
        id = notify.loading(msgs.loading!);
      }, LOADING_TOAST_DELAY_MS)
    : undefined;
  try {
    const result = await fn();
    clearTimeout(timer);
    if (msgs.success) notify.success(msgs.success, { id });
    else if (id !== undefined) notify.dismiss(id);
    return result;
  } catch (err) {
    clearTimeout(timer);
    if (isNextControlError(err)) {
      if (id !== undefined) notify.dismiss(id);
      throw err;
    }
    notify.error(msgs.error ?? "Something went wrong", { id, description: errorMessage(err) });
    return undefined;
  }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm --filter web test`

- [ ] **Step 6: Toaster** — `apps/web/components/ui/sonner.tsx`

```tsx
"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** App-wide toaster, following the active light/dark theme and design tokens. */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      position="bottom-right"
      closeButton
      style={
        {
          "--normal-bg": "var(--color-elevated)",
          "--normal-text": "var(--color-fg)",
          "--normal-border": "var(--color-hairline)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
```

In `apps/web/app/layout.tsx`, `import { Toaster } from "@/components/ui/sonner";` and render `<Toaster />` as the last child inside `<ThemeProvider>`. Verify the three CSS variable names exist: `grep -n "\-\-color-elevated\|\-\-color-fg:\|\-\-color-hairline" apps/web/app/globals.css` — adjust to the real token names if they differ.

- [ ] **Step 7: `Button loading`** — in `components/ui/button.tsx` change the function to:

```tsx
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Show a spinner and disable the button while an action runs. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
}
```

with `import { Loader2 } from "lucide-react"`. (`asChild` keeps passing its single child through untouched — Slot requires exactly one child.)

- [ ] **Step 8: Verify** — `pnpm typecheck && pnpm test`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/components/ui apps/web/app/layout.tsx apps/web/lib/action-feedback.ts apps/web/lib/action-feedback.test.ts
git commit -m "feat(web): toasts, runAction helper, Button loading prop"
```

---

### Task 8: Apply feedback to in-scope flows

**Root cause being fixed:** in React 19, state updates after an `await` inside `startTransition(async () => …)` are **not** part of the transition. Today the dialog closes (or the row resets) the moment the server action resolves, `isPending` flips off, and `router.refresh()`/`push()` then runs with no indicator → the "stuck" gap.

**Canonical pattern** (apply to every flow below):

```tsx
const [pending, startTransition] = useTransition();

function submit() {
  startTransition(async () => {
    const result = await runAction(() => createThing(input), {
      loading: "Creating project…",
      success: "Project created",
      error: "Couldn't create project",
    });
    if (result === undefined) return; // error already toasted
    // Post-await updates must be re-wrapped so `pending` spans the refresh/navigation
    // and the UI changes in one commit when the new data is on screen.
    startTransition(() => {
      resetForm();
      onOpenChange(false);
      router.refresh(); // or router.push(`/d/${result.id}`)
    });
  });
}
```

- Dialog forms that already show an inline server error may keep it: call the action directly in a `try/catch`, set the inline error in `catch`, `toast.success(...)` on success, and still re-wrap the post-await updates in `startTransition`.
- `void`-returning actions: use `runAction(async () => { await action(); return true; }, …)` so success is distinguishable from failure.
- Submit buttons: `<Button loading={pending}>` (or keep the existing custom button and render `{pending && <Loader2 className="size-4 animate-spin" />}` if it isn't the shadcn `Button`).
- Creates that navigate keep the dialog open with the spinner until the destination's loading skeleton takes over.

**Files (each: apply the pattern to every mutation listed):**
- `apps/web/components/projects-list.tsx` — project create (~L228), project rename (~L371) + delete (~L386), diagram rename (~L582) + delete (~L597). Replace the local `errorMessage` with the import from `@/lib/action-feedback`.
- `apps/web/components/new-diagram-dialog.tsx` — the three `startTransition` blocks (~L96, L125, L142) ending in `router.push(\`/d/${id}\`)`: move `go(id)` into the re-wrapped `startTransition`.
- `apps/web/components/workspaces-grid.tsx` — workspace create (~L191) → `router.push(\`/w/${id}\`)` inside the re-wrapped transition.
- `apps/web/components/workspace-manage-dialog.tsx` — rename, delete, member add / role change / remove.
- `apps/web/components/context-switcher.tsx` — org switch (~L74, L83): wrap in `useTransition`, show a spinner on the switcher trigger while pending, `router.refresh()` inside the transition; org create (~L190) keeps its hard redirect.
- `apps/web/components/settings/profile-form.tsx`, `organization-form.tsx`, `change-password-form.tsx`, `members-manager.tsx` — success/error toasts + `Button loading`.
- `apps/web/components/catalog-admin.tsx`, `apps/web/components/catalog/asset-detail.tsx` — asset create/delete.

- [ ] **Step 1:** Apply the pattern to `projects-list.tsx`; `pnpm typecheck`; manual on Slow 4G: create project keeps "Creating…" until the new folder row shows, then toast; rename/delete likewise. Commit `feat(web): pending-through-refresh + toasts for projects and diagrams`.
- [ ] **Step 2:** `new-diagram-dialog.tsx` + `workspaces-grid.tsx`; manual: dialog stays open with spinner until the diagram/workspace skeleton appears. Commit `feat(web): keep create dialogs pending until navigation`.
- [ ] **Step 3:** `workspace-manage-dialog.tsx` + `context-switcher.tsx`; manual: org switch shows a spinner then the new scope. Commit `feat(web): feedback for workspace management and org switching`.
- [ ] **Step 4:** settings forms + catalog; manual: each save shows spinner → toast. Commit `feat(web): feedback for settings and catalog actions`.
- [ ] **Step 5:** Expired-session check: sign out in another tab, then rename a project → lands on `/sign-in` (no error toast).

---

### Task 9: Measure, document, ship

- [ ] **Step 1:** Push the branch; on the Vercel preview, record TTFB (DevTools → Network → document request → Timing) for `/`, `/projects`, `/d/[id]`, three loads each, and compare with production (`main`). Note the Vercel function region vs the Neon region (`vercel inspect <preview-url>`, Neon console) — report a mismatch to the user; do not change it.
- [ ] **Step 2:** Update `docs/roadmap.md`: mark W20 shipped in the workstream table (summary + before/after TTFB), remove it from "Next steps", add "W20 follow-up: AI & canvas operation feedback" to the backlog.
- [ ] **Step 3:** `pnpm typecheck && pnpm test` green; open the PR (no Claude footer) and wait for CI.
