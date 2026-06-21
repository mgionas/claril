# W14 — shadcn Sidebar Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Swap the top-bar `AppShell` internals for a shadcn collapsible-icon **sidebar** (sidebar-07 pattern) on the management pages (dashboard, catalog, settings), keeping the `AppShell` public API so consumers barely change. Retire the in-content `SettingsShell` rail (its sub-nav moves into the sidebar). Workbench + landing untouched.

**Architecture:** Vendored shadcn `sidebar` primitives themed to Claril tokens; `AppShell` rebuilt as `SidebarProvider` + `Sidebar` + `SidebarInset`, reusing `ContextSwitcher` (header) and `UserMenu` (footer); nav is scope-aware (personal hides Catalog/Org/Members) and active-state comes from `usePathname()`.

**Spec:** `docs/superpowers/specs/2026-06-21-w14-sidebar-shell-design.md`.

**Verified facts:**
- shadcn configured (`apps/web/components.json`: new-york, rsc, lucide, aliases `@/components/ui`, `@/hooks`). Only `ui/tooltip.tsx` of the sidebar deps exists.
- `AppShell` props today: `{ children, userName, userEmail?, active?: "dashboard"|"catalog"|"settings", actions?, fullBleed?, contentClassName? }`; hides Catalog when `useSession().session?.activeOrganizationId` is falsy. Reuses `ContextSwitcher` + a local `UserMenu`.
- Consumers: `components/dashboard.tsx` (active="dashboard"), `app/catalog/{page,[assetId]/page,error,not-found}.tsx` (active="catalog"), `app/settings/layout.tsx` → `components/settings/settings-shell.tsx` (active="settings" + sub-nav rail for Profile/Organization/Members/AI providers).
- Settings routes: `/settings/profile`, `/settings/organization`, `/settings/members`, `/settings/ai`.

---

### Task 1: Vendor + theme the shadcn sidebar primitives

**Files:** `apps/web/components/ui/*` (new, generated), `apps/web/hooks/*` (new), `apps/web/app/globals.css`

- [ ] **Step 1: Install the sidebar block + collapsible** (from repo root or `apps/web`):
```bash
cd apps/web && pnpm dlx shadcn@latest add sidebar collapsible
```
This vendors `ui/sidebar.tsx` and its deps (`ui/sheet.tsx`, `ui/skeleton.tsx`, `ui/separator.tsx`, `ui/collapsible.tsx`, the `use-mobile` hook, and `button`/`input`/`tooltip` if missing). Accept overwrites only for files that don't already exist; if it wants to overwrite an EXISTING component we rely on (e.g. `button.tsx`, `tooltip.tsx`, `dropdown-menu.tsx`), DECLINE/restore it (we don't want our themed versions clobbered) — review `git status` after and `git checkout` any unintended overwrite of a pre-existing component.

- [ ] **Step 2: Map `--sidebar-*` tokens to Claril's palette** in `apps/web/app/globals.css`. The sidebar component reads `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`, `--sidebar-primary`, `--sidebar-primary-foreground`. Add them in the same `:root`/`@theme` block where the existing `--color-*` / shadcn bridge vars live, pointing at Claril tokens, e.g.:
```css
  --sidebar: var(--color-panel);
  --sidebar-foreground: var(--color-fg);
  --sidebar-border: var(--color-hairline);
  --sidebar-accent: var(--color-elevated);
  --sidebar-accent-foreground: var(--color-fg);
  --sidebar-primary: var(--color-accent);
  --sidebar-primary-foreground: #ffffff;
  --sidebar-ring: var(--color-accent);
```
Also expose them to Tailwind v4 via the `@theme inline` mapping if the repo uses one for the other shadcn vars (mirror how `--color-card` etc. are bridged — check globals.css and follow the same pattern so `bg-sidebar`, `text-sidebar-foreground`, etc. resolve).

- [ ] **Step 3: Verify** — `pnpm --filter web typecheck` → PASS; `pnpm --filter web build` → PASS (sidebar primitives compile; nothing consumes them yet).

- [ ] **Step 4: Commit**
```bash
git add apps/web/components/ui apps/web/hooks apps/web/app/globals.css apps/web/components.json
git commit -m "$(cat <<'EOF'
feat(web): vendor shadcn sidebar primitives, themed to Claril tokens (W14)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
(Stage only the generated ui/hook files + globals.css + components.json; leave .archmantic/model.json, .gitignore, AGENTS.md.)

---

### Task 2: Rebuild `AppShell` as the sidebar shell (keep API)

**Files:** `apps/web/components/app-shell.tsx`

> Keep the exported `AppShell` + its props. Move the nav into the sidebar; reuse `ContextSwitcher` (header) and the existing `UserMenu` (footer). READ the current `app-shell.tsx` first to lift `UserMenu` and the scope signal verbatim.

- [ ] **Step 1: Rebuild `app-shell.tsx`.** Target shape (adapt prop names to the actually-vendored sidebar API):
```tsx
"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes, ChevronRight, LayoutDashboard, Library, Settings as SettingsIcon,
  Building2, Users, Sparkles, UserRound,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { ContextSwitcher } from "@/components/context-switcher";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type AppShellSection = "dashboard" | "catalog" | "settings";

export interface AppShellProps {
  children: ReactNode;
  userName: string;
  userEmail?: string;
  active?: AppShellSection;       // optional override; default derives from pathname
  actions?: ReactNode;
  fullBleed?: boolean;
  contentClassName?: string;
  title?: string;                 // optional inset-header title
}

export function AppShell({ children, userName, userEmail, actions, fullBleed, contentClassName, title }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar userName={userName} userEmail={userEmail} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-hairline bg-canvas/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          {title && <span className="text-sm font-medium text-fg">{title}</span>}
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
        {fullBleed ? (
          <main className="flex-1">{children}</main>
        ) : (
          <main className={cn("mx-auto w-full max-w-5xl flex-1 px-6 py-8", contentClassName)}>{children}</main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

const MAIN = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, orgOnly: false },
  { label: "Catalog", href: "/catalog", icon: Library, orgOnly: true },
];
const SETTINGS = [
  { label: "Profile", href: "/settings/profile", icon: UserRound, orgOnly: false },
  { label: "Organization", href: "/settings/organization", icon: Building2, orgOnly: true },
  { label: "Members", href: "/settings/members", icon: Users, orgOnly: true },
  { label: "AI providers", href: "/settings/ai", icon: Sparkles, orgOnly: false },
];

function AppSidebar({ userName, userEmail }: { userName: string; userEmail?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isPersonal = !session?.session?.activeOrganizationId;
  const settingsOpen = pathname.startsWith("/settings");
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2 px-2 py-1.5" aria-label="Claril home">
          <span className="grid size-6 place-items-center rounded-[6px] bg-accent/15 text-accent">
            <Boxes className="size-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Claril</span>
        </Link>
        <ContextSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {MAIN.filter((i) => !(i.orgOnly && isPersonal)).map((i) => (
              <SidebarMenuItem key={i.href}>
                <SidebarMenuButton asChild isActive={isActive(i.href)} tooltip={i.label}>
                  <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            <Collapsible defaultOpen={settingsOpen} className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton isActive={settingsOpen} tooltip="Settings">
                    <SettingsIcon /><span>Settings</span>
                    <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {SETTINGS.filter((i) => !(i.orgOnly && isPersonal)).map((i) => (
                      <SidebarMenuSubItem key={i.href}>
                        <SidebarMenuSubButton asChild isActive={isActive(i.href)}>
                          <Link href={i.href}>{i.label}</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu userName={userName} userEmail={userEmail} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
```
- Lift the existing `UserMenu` from the current `app-shell.tsx` verbatim (it already renders a dropdown with name/email + Settings link + Sign out). Style its trigger to sit in the footer (full-width row showing avatar + name, collapsing to just the avatar in icon mode via `group-data-[collapsible=icon]:hidden` on the text). Reuse `signOut`/`useRouter` exactly as today.
- `ContextSwitcher` is a client component with its own dropdown; ensure it renders acceptably inside `SidebarHeader` (it may need a width tweak / `w-full`). Keep its behavior.
- Keep the `active` prop in the type (accepted, optional) even though active now derives from `usePathname()`, so existing consumers passing `active=...` still compile.

- [ ] **Step 2: Verify** — `pnpm --filter web typecheck` → PASS; `pnpm --filter web build` → PASS. The dashboard + catalog pages already pass `<AppShell ...>`; they now render in the sidebar inset with no change.

- [ ] **Step 3: Commit**
```bash
git add apps/web/components/app-shell.tsx
git commit -m "$(cat <<'EOF'
feat(web): rebuild AppShell as a collapsible sidebar shell (W14)

Sidebar header = wordmark + ContextSwitcher; content = Dashboard/Catalog +
collapsible Settings group (scope-gated); footer = user menu; inset header =
trigger + actions. Same AppShell API; active state from pathname.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Retire `SettingsShell`

**Files:** `apps/web/app/settings/layout.tsx`, delete `apps/web/components/settings/settings-shell.tsx`

- [ ] **Step 1:** Rewrite `app/settings/layout.tsx` to wrap children directly in `AppShell` (keep the session/auth gate it already does):
```tsx
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");
  return (
    <AppShell userName={session.user.name} userEmail={session.user.email} title="Settings">
      {children}
    </AppShell>
  );
}
```
- [ ] **Step 2:** `git rm apps/web/components/settings/settings-shell.tsx`. Grep for any other importer of `SettingsShell` (there should be none besides the layout); if found, update it.
- [ ] **Step 3:** Confirm settings pages still render their own content (they do — `SettingsHeader`/`SettingsCard` from `settings-ui.tsx` are untouched). The sub-nav now comes from the sidebar's Settings group.
- [ ] **Step 4: Verify + commit** — `pnpm --filter web typecheck` + `pnpm --filter web build` → PASS.
```bash
git add apps/web/app/settings/layout.tsx apps/web/components/settings/settings-shell.tsx
git commit -m "$(cat <<'EOF'
refactor(web): retire SettingsShell rail — settings nav lives in the sidebar (W14)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verify + manual

**Files:** none.

- [ ] **Step 1:** `pnpm --filter web typecheck` + `pnpm --filter web build` + `cd apps/web && pnpm exec vitest run` (web unit suites) → all PASS.
- [ ] **Step 2: Manual matrix** (`pnpm dev`): sidebar expand/collapse + persistence across reload; mobile drawer (narrow viewport); context switch (Personal↔org) re-scopes nav (Catalog/Organization/Members hidden in Personal); Settings group expands + each sub-page navigates with correct active highlight; dashboard "New project" actions slot works; catalog detail/error/not-found render in the inset; **workbench `/d/[id]` and landing unchanged**; keyboard toggle (⌘/ctrl-b) + a11y (aria-current, trigger label, focus order).

---

## Self-Review
- **Spec coverage:** vendor+theme primitives (T1), AppShell→sidebar keeping API (T2), retire SettingsShell (T3), verify (T4). ✓
- **Placeholders:** install command + token mapping + the full AppShell composition given; UI adapts to the vendored sidebar API (prop names confirmed against the generated files in T2).
- **Type consistency:** `AppShell` keeps its prop names (+ optional `title`); `AppShellSection` retained; consumers unchanged; active derives from `usePathname`.
- **Risk notes:** the `shadcn add` may try to overwrite pre-existing themed components (`button`/`tooltip`/`dropdown-menu`) — T1 Step 1 guards against clobbering them; `ContextSwitcher` may need a width tweak inside the header (T2 Step 1).
- **Out of scope:** workbench chrome, landing, P4 workspace tree (added into this sidebar later).
