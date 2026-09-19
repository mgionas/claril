"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  Library,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { titleForPath } from "@/lib/page-title";
import { PageHeaderProvider, usePageHeader } from "@/components/page-header";
import { ContextSwitcher } from "@/components/context-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

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

interface NavLeaf {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Org-only surfaces are hidden in the personal scope. */
  orgOnly?: boolean;
  /** Personal-only surfaces are hidden in the org scope. */
  personalOnly?: boolean;
}

const MAIN_NAV: NavLeaf[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  // Org workspaces live on their own route; per-workspace project pages are
  // under `/w/[id]`.
  { label: "Workspaces", href: "/workspaces", icon: LayoutGrid, orgOnly: true },
  // Org projects live under per-workspace routes (`/w/[id]`); the flat
  // `/projects` listing is personal-scope only.
  { label: "Projects", href: "/projects", icon: FolderKanban, personalOnly: true },
  { label: "Catalog", href: "/catalog", icon: Library, orgOnly: true },
];

const SETTINGS_NAV: Omit<NavLeaf, "icon">[] = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Organization", href: "/settings/organization", orgOnly: true },
  { label: "Members", href: "/settings/members", orgOnly: true },
  { label: "AI providers", href: "/settings/ai" },
];

function AppSidebar({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail?: string;
}) {
  const pathname = usePathname();
  // The active org id drives scope-aware chrome: in the personal scope (no
  // active org) org-only surfaces (Catalog, Organization, Members) are hidden.
  const { data: session } = useSession();
  const isPersonal = !session?.session?.activeOrganizationId;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const mainNav = MAIN_NAV.filter(
    (item) =>
      (!item.orgOnly || !isPersonal) && (!item.personalOnly || isPersonal),
  );
  const settingsNav = SETTINGS_NAV.filter((item) => !item.orgOnly || !isPersonal);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <ContextSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {mainNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(item.href)}
                  tooltip={item.label}
                >
                  <Link href={item.href} aria-current={isActive(item.href) ? "page" : undefined}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            <Collapsible
              asChild
              defaultOpen={pathname.startsWith("/settings")}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip="Settings">
                    <Settings />
                    <span>Settings</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {settingsNav.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                          <Link
                            href={item.href}
                            aria-current={isActive(item.href) ? "page" : undefined}
                          >
                            <span>{item.label}</span>
                          </Link>
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
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu userName={userName} userEmail={userEmail} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function UserMenu({ userName, userEmail }: { userName: string; userEmail?: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const initials = userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip={userName}
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          aria-label="Account menu"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-elevated text-xs font-medium text-fg-muted">
            {initials || <User className="size-4" />}
          </span>
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className="truncate text-sm font-medium text-fg">{userName}</span>
            {userEmail && (
              <span className="truncate text-xs font-normal text-fg-subtle">{userEmail}</span>
            )}
          </span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="right" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-fg">{userName}</span>
          {userEmail && (
            <span className="truncate text-xs font-normal text-fg-subtle">{userEmail}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void handleSignOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
