import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { getAiConfig } from "@/lib/ai";
import { listProjects } from "@/lib/diagram-actions";
import { canDo, requireWorkspaceRole } from "@/lib/tenancy";
import { AppShell } from "@/components/app-shell";
import { ProjectsList } from "@/components/projects-list";
import { WorkspaceManageButton } from "@/components/workspace-manage-button";

/**
 * Per-workspace projects page (W13 P4). Role-gated: any workspace viewer may
 * read the project/diagram tree; editors+ get create/rename/delete; managers
 * (workspace admins) get a Manage entry. Missing or unauthorized workspaces
 * resolve to notFound() so we never leak existence across tenants.
 */
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const role = await requireWorkspaceRole(userId, workspaceId, "view").catch(() => null);
  if (!role) notFound();

  // Workspace name + org id, read directly here (no per-workspace fetch action
  // exists; this single row is cheap and keeps the page self-contained).
  const ws = (
    await db
      .select({ name: schema.workspace.name, orgId: schema.workspace.organizationId })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, workspaceId))
      .limit(1)
  )[0];
  if (!ws) notFound();

  const projects = await listProjects(workspaceId);

  // Gate the "Generate with AI" creation mode on a provider configured for the
  // workspace's org (mirrors how the dashboard resolves AI chrome).
  const aiConnected = Boolean(await getAiConfig({ kind: "org", orgId: ws.orgId }));

  const canManage = canDo(role, "manage");
  const readOnly = !canDo(role, "edit");

  return (
    <AppShell
      userName={session.user.name}
      userEmail={session.user.email}
      title={ws.name}
      actions={canManage ? <WorkspaceManageButton workspaceId={workspaceId} /> : undefined}
    >
      <ProjectsList
        context="org"
        workspaceId={workspaceId}
        projects={projects}
        aiConnected={aiConnected}
        readOnly={readOnly}
      />
    </AppShell>
  );
}
