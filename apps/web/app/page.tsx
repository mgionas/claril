import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { getActiveContext } from "@/lib/context";
import { getAiConfig } from "@/lib/ai";
import { getDashboardStats } from "@/lib/dashboard-stats";
import type { DashboardStats } from "@/lib/dashboard-stats-core";
import { listWorkspaces } from "@/lib/workspace-actions";
import { AppShell } from "@/components/app-shell";
import { DashboardOverview } from "@/components/dashboard-overview";
import { WorkspacesGrid } from "@/components/workspaces-grid";
import { Landing } from "@/components/marketing/landing";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return <Landing />;
  }

  // Aggregate stats for the active scope. Gate AI chrome on a configured
  // provider, resolved for the active context (org -> decrypted BYOK, personal).
  const ctx = await getActiveContext();
  const stats = await getDashboardStats();
  const aiConnected = ctx ? Boolean(await getAiConfig(ctx)) : false;

  // `getDashboardStats` returns null when there is no resolvable scope; render a
  // friendly empty overview rather than failing the page.
  const safeStats: DashboardStats =
    stats ?? {
      scope: ctx?.kind ?? "personal",
      projectCount: 0,
      diagramCount: 0,
      diagramsByType: { bpmn: 0, sequence: 0, c4: 0 },
      recent: [],
    };

  // Org scope: the dashboard root is the Workspaces grid (per-workspace project
  // pages live under `/w/[id]`). Personal scope keeps the diagram overview.
  if (ctx?.kind === "org") {
    const workspaces = await listWorkspaces();
    // Only org owners/admins may create workspaces (mirrors `createWorkspace`'s
    // guard, which resolves the role from the `member` table for the active org).
    const orgRole = (
      await db
        .select({ role: schema.member.role })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, ctx.orgId),
            eq(schema.member.userId, session.user.id),
          ),
        )
        .limit(1)
    )[0]?.role;
    const canCreate = orgRole === "owner" || orgRole === "admin";
    return (
      <AppShell userName={session.user.name} userEmail={session.user.email} title="Workspaces">
        <WorkspacesGrid workspaces={workspaces} canCreate={canCreate} />
      </AppShell>
    );
  }

  return (
    <AppShell userName={session.user.name} userEmail={session.user.email} title="Dashboard">
      <DashboardOverview
        stats={safeStats}
        userName={session.user.name}
        aiConnected={aiConnected}
      />
    </AppShell>
  );
}
