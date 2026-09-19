import { getCurrentSession } from "@/lib/session";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

/**
 * Persistent frame for signed-in management routes. Signed-out visitors get the
 * bare page (only `/` renders for them — the landing; every other page redirects
 * to /sign-in in its own guard, which must stay because layouts don't re-run on
 * client navigation).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session?.user) return <>{children}</>;
  return (
    <AppShell userName={session.user.name} userEmail={session.user.email}>
      {children}
    </AppShell>
  );
}
