import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SettingsShell } from "@/components/settings/settings-shell";

/**
 * Shared chrome for every /settings route. Resolves the session once (auth gate)
 * and renders the AppShell + settings sub-nav around the page. Individual
 * settings pages render only their own content — no second shell.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  return (
    <SettingsShell userName={session.user.name} userEmail={session.user.email}>
      {children}
    </SettingsShell>
  );
}
