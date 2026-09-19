import { getCurrentSession } from "@/lib/session";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { getAiConfigFor } from "@/lib/ai";
import { listProjects } from "@/lib/diagram-actions";
import { canDo, requireWorkspaceRole } from "@/lib/tenancy";
import { ProjectsList } from "@/components/projects-list";
import { WorkspaceManageButton } from "@/components/workspace-manage-button";
import { PageHeader } from "@/components/page-header";

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
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  // Role check + workspace row (name, org id) together. The name is only
  // rendered once the role check passes, so this never leaks existence across
  // tenants.
  const [role, ws] = await Promise.all([
    requireWorkspaceRole(userId, workspaceId, "view").catch(() => null),
    db
      .select({ name: schema.workspace.name, orgId: schema.workspace.organizationId })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, workspaceId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!role || !ws) notFound();

  // Gate the "Generate with AI" creation mode on a provider configured for the
  // workspace's org (mirrors how the dashboard resolves AI chrome).
  const [projects, aiConfig] = await Promise.all([
    listProjects(workspaceId),
    getAiConfigFor({ kind: "org", orgId: ws.orgId }),
  ]);
  const aiConnected = Boolean(aiConfig);

  const canManage = canDo(role, "manage");
  const readOnly = !canDo(role, "edit");

  return (
    <>
      <PageHeader
        title={ws.name}
        actions={
          canManage ? (
            <WorkspaceManageButton workspaceId={workspaceId} workspaceName={ws.name} />
          ) : undefined
        }
      />
      <ProjectsList
        context="org"
        workspaceId={workspaceId}
        projects={projects}
        aiConnected={aiConnected}
        readOnly={readOnly}
      />
    </>
  );
}
