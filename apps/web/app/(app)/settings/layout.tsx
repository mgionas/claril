import { getCurrentSession } from "@/lib/session";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

/** Settings pages render inside the persistent (app) frame; this only guards auth. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/sign-in");
  return <>{children}</>;
}
