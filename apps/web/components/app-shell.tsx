"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, LogOut, Settings, User } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { ContextSwitcher } from "@/components/context-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AppShellSection = "dashboard" | "catalog" | "settings";

interface NavItem {
  id: AppShellSection;
  label: string;
  href: string;
}

const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/" },
  { id: "catalog", label: "Catalog", href: "/catalog" },
  { id: "settings", label: "Settings", href: "/settings/ai" },
];

export interface AppShellProps {
  children: ReactNode;
  /** Display name for the user menu. */
  userName: string;
  /** Optional email shown under the name in the user menu. */
  userEmail?: string;
  /** Highlights the matching primary-nav link. */
  active?: AppShellSection;
  /** Right-aligned page actions rendered in the top bar (e.g. a primary CTA). */
  actions?: ReactNode;
  /** Render children full-bleed instead of inside the constrained container. */
  fullBleed?: boolean;
  /** Extra classes for the content container. */
  contentClassName?: string;
}

/**
 * Shared shell for Claril's authenticated pages: a sticky, frosted app bar
 * with the wordmark, primary nav, an actions slot, and a user menu — plus a
 * constrained (or full-bleed) content area. Reused by the dashboard, the
 * Asset Catalog, and Settings.
 */
export function AppShell({
  children,
  userName,
  userEmail,
  active,
  actions,
  fullBleed = false,
  contentClassName,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg">
      <AppBar userName={userName} userEmail={userEmail} active={active} actions={actions} />
      {fullBleed ? (
        <main className="flex-1">{children}</main>
      ) : (
        <main className={cn("mx-auto w-full max-w-5xl flex-1 px-6 py-8", contentClassName)}>
          {children}
        </main>
      )}
    </div>
  );
}

function AppBar({
  userName,
  userEmail,
  active,
  actions,
}: {
  userName: string;
  userEmail?: string;
  active?: AppShellSection;
  actions?: ReactNode;
}) {
  // The active org id drives scope-aware chrome: in the personal scope (no
  // active org) the Catalog — an org-only surface — is hidden.
  const { data: session } = useSession();
  const isPersonal = !session?.session?.activeOrganizationId;
  const nav = isPersonal ? NAV.filter((item) => item.id !== "catalog") : NAV;

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
          aria-label="Claril home"
        >
          <span className="grid size-6 place-items-center rounded-[6px] bg-accent/15 text-accent">
            <Boxes className="size-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Claril</span>
        </Link>

        <ContextSwitcher />

        <nav className="ml-2 hidden items-center gap-0.5 sm:flex" aria-label="Primary">
          {nav.map((item) => (
            <NavLink key={item.id} item={item} active={active === item.id} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {actions}
          <UserMenu userName={userName} userEmail={userEmail} />
        </div>
      </div>
    </header>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-[6px] px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-elevated text-fg"
          : "text-fg-muted hover:bg-elevated/60 hover:text-fg",
      )}
    >
      {item.label}
    </Link>
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
      <DropdownMenuTrigger
        className="flex size-8 items-center justify-center rounded-full border border-hairline bg-elevated text-xs font-medium text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label="Account menu"
      >
        {initials || <User className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-fg">{userName}</span>
          {userEmail && (
            <span className="truncate text-xs font-normal text-fg-subtle">{userEmail}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/ai">
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
