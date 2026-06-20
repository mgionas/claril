import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";

/**
 * Tenancy resolution + authorization helpers, shared by the dashboard and the
 * diagram server actions. Tenancy chain: Organization → Workspace → Project →
 * Diagram. V1 resolves the user's first org/workspace; richer multi-workspace
 * selection is deferred.
 */

export interface ActiveTenancy {
  organizationId: string;
  workspaceId: string;
}

/**
 * Ensure the user has a personal Org → Workspace, creating them on first use.
 * Idempotent. Bootstraps the tenancy chain down to the workspace level so the
 * dashboard can list/create projects itself.
 */
export async function ensureUserWorkspace(userId: string): Promise<ActiveTenancy> {
  const memberships = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);

  if (memberships.length === 0) {
    const organizationId = randomUUID();
    const workspaceId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.organization).values({
        id: organizationId,
        name: "Personal",
        slug: `org-${randomUUID().slice(0, 8)}`,
      });
      await tx
        .insert(schema.member)
        .values({ id: randomUUID(), organizationId, userId, role: "owner" });
      await tx.insert(schema.workspace).values({
        id: workspaceId,
        organizationId,
        name: "My Workspace",
        slug: "default",
      });
      await tx
        .insert(schema.workspaceMember)
        .values({ id: randomUUID(), workspaceId, userId, role: "admin" });
    });
    return { organizationId, workspaceId };
  }

  const organizationId = memberships[0].organizationId;
  const workspaces = await db
    .select({ id: schema.workspace.id })
    .from(schema.workspace)
    .where(eq(schema.workspace.organizationId, organizationId))
    .limit(1);

  if (workspaces[0]) {
    return { organizationId, workspaceId: workspaces[0].id };
  }

  const workspaceId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.workspace).values({
      id: workspaceId,
      organizationId,
      name: "My Workspace",
      slug: "default",
    });
    await tx
      .insert(schema.workspaceMember)
      .values({ id: randomUUID(), workspaceId, userId, role: "admin" });
  });
  return { organizationId, workspaceId };
}

/**
 * Assert the user may access the given workspace. Throws if not a member.
 */
export async function assertWorkspaceAccess(userId: string, workspaceId: string): Promise<void> {
  const rows = await db
    .select({ id: schema.workspaceMember.id })
    .from(schema.workspaceMember)
    .where(
      and(
        eq(schema.workspaceMember.workspaceId, workspaceId),
        eq(schema.workspaceMember.userId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Forbidden");
}

/**
 * Assert the user may access the given project (via its workspace). Returns the
 * project's workspaceId. Throws if not authorized.
 */
export async function assertProjectAccess(userId: string, projectId: string): Promise<string> {
  const rows = await db
    .select({ workspaceId: schema.project.workspaceId })
    .from(schema.project)
    .innerJoin(
      schema.workspaceMember,
      eq(schema.workspaceMember.workspaceId, schema.project.workspaceId),
    )
    .where(and(eq(schema.project.id, projectId), eq(schema.workspaceMember.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new Error("Forbidden");
  return rows[0].workspaceId;
}

/**
 * Assert the user may access the given diagram (via project → workspace).
 * Returns the diagram's projectId. Throws if not authorized.
 */
export async function assertDiagramAccess(userId: string, diagramId: string): Promise<string> {
  const rows = await db
    .select({ projectId: schema.diagram.projectId })
    .from(schema.diagram)
    .innerJoin(schema.project, eq(schema.project.id, schema.diagram.projectId))
    .innerJoin(
      schema.workspaceMember,
      eq(schema.workspaceMember.workspaceId, schema.project.workspaceId),
    )
    .where(and(eq(schema.diagram.id, diagramId), eq(schema.workspaceMember.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new Error("Forbidden");
  return rows[0].projectId;
}
