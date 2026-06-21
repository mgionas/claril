"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

interface SettingsNavItem {
  label: string;
  href: string;
  /** Matches when the pathname starts with this prefix. */
  match: string;
}

const NAV: SettingsNavItem[] = [
  { label: "Profile", href: "/settings/profile", match: "/settings/profile" },
  { label: "Organization", href: "/settings/organization", match: "/settings/organization" },
  { label: "Members", href: "/settings/members", match: "/settings/members" },
  { label: "AI providers", href: "/settings/ai", match: "/settings/ai" },
];

export interface SettingsShellProps {
  children: ReactNode;
  userName: string;
  userEmail?: string;
}

/**
 * Settings chrome shared by every /settings route. Wraps the page in the global
 * AppShell (with the Settings tab active) and renders a secondary nav rail so
 * the sub-pages (Profile, Organization, Members, AI providers) feel like one
 * surface. The AI providers page links here too — its own content renders
 * inside this shell without a second AppShell.
 */
export function SettingsShell({ children, userName, userEmail }: SettingsShellProps) {
  const pathname = usePathname();

  return (
    <AppShell active="settings" userName={userName} userEmail={userEmail}>
      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <aside className="md:w-48 md:shrink-0">
          <h1 className="px-2.5 pb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Settings
          </h1>
          <nav aria-label="Settings" className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.match}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-elevated text-fg"
                      : "text-fg-muted hover:bg-elevated/60 hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </AppShell>
  );
}
