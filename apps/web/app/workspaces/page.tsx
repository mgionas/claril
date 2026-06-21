import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { getActiveContext } from "@/lib/context";
import { listWorkspaces } from "@/lib/workspace-actions";
import { AppShell } from "@/components/app-shell";
import { WorkspacesGrid } from "@/components/workspaces-grid";

export default async function WorkspacesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  // Workspaces are an org-only surface; personal scope has no workspaces.
  const ctx = await getActiveContext();
  if (ctx?.kind !== "org") {
    redirect("/");
  }

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
