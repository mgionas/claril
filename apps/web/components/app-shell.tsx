"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  ChevronRight,
  LayoutDashboard,
  Library,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { ContextSwitcher } from "@/components/context-switcher";
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

/** Kept for back-compat with consumers that still pass `active`. */
export type AppShellSection = "dashboard" | "catalog" | "settings";

export interface AppShellProps {
  children: ReactNode;
  /** Display name for the user menu. */
  userName: string;
  /** Optional email shown under the name in the user menu. */
  userEmail?: string;
  /**
   * Back-compat: previously highlighted the matching primary-nav link. The
   * active item now derives from the current pathname, so this is ignored.
   */
  active?: AppShellSection;
  /** Right-aligned page actions rendered in the inset header (e.g. a primary CTA). */
  actions?: ReactNode;
  /** Render children full-bleed instead of inside the constrained container. */
  fullBleed?: boolean;
  /** Extra classes for the content container. */
  contentClassName?: string;
  /** Optional label shown next to the sidebar trigger in the inset header. */
  title?: string;
}

/**
 * Shared shell for Claril's authenticated pages: a collapsible frosted sidebar
 * (wordmark + scope switcher, primary nav, a collapsible Settings group, and a
 * user menu) alongside an inset content area with a sticky header. Reused by the
 * dashboard, the Asset Catalog, and Settings.
 */
export function AppShell({
  children,
  userName,
  userEmail,
  actions,
  fullBleed = false,
  contentClassName,
  title,
}: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar userName={userName} userEmail={userEmail} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-hairline bg-canvas/80 px-4 backdrop-blur">
          <SidebarTrigger />
          {title && (
            <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
          )}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
        {fullBleed ? (
          <main className="flex-1">{children}</main>
        ) : (
          <main className={cn("mx-auto w-full max-w-5xl px-6 py-8", contentClassName)}>
            {children}
          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

interface NavLeaf {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Org-only surfaces are hidden in the personal scope. */
  orgOnly?: boolean;
}

const MAIN_NAV: NavLeaf[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
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

  const mainNav = MAIN_NAV.filter((item) => !item.orgOnly || !isPersonal);
  const settingsNav = SETTINGS_NAV.filter((item) => !item.orgOnly || !isPersonal);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2 px-1 py-1 transition-opacity hover:opacity-80"
          aria-label="Claril home"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-accent/15 text-accent">
            <Boxes className="size-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Claril
          </span>
        </Link>
        <div className="w-full group-data-[collapsible=icon]:hidden">
          <ContextSwitcher />
        </div>
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
