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

/** The XOR parent of a diagram. */
export type DiagramParent =
  | { kind: "org"; projectId: string }
  | { kind: "personal"; personalProjectId: string };

/** Pure: resolve a diagram's single parent, or throw if not exactly one is set. */
export function diagramParent(d: {
  projectId: string | null;
  personalProjectId: string | null;
}): DiagramParent {
  const hasOrg = Boolean(d.projectId);
  const hasPersonal = Boolean(d.personalProjectId);
  if (hasOrg === hasPersonal) {
    throw new Error("Diagram must have exactly one parent (project XOR personal_project)");
  }
  return hasOrg
    ? { kind: "org", projectId: d.projectId as string }
    : { kind: "personal", personalProjectId: d.personalProjectId as string };
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

/** Assert the user owns the given personal project. Throws if not. */
export async function assertPersonalProjectAccess(
  userId: string,
  personalProjectId: string,
): Promise<void> {
  const rows = await db
    .select({ id: schema.personalProject.id })
    .from(schema.personalProject)
    .where(
      and(
        eq(schema.personalProject.id, personalProjectId),
        eq(schema.personalProject.ownerUserId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Forbidden");
}

export type DiagramAccess =
  | { kind: "org"; projectId: string; workspaceId: string }
  | { kind: "personal"; personalProjectId: string };

/**
 * Assert the user may access the diagram and return its parent context. Org
 * diagrams resolve via project → workspace → workspaceMember; personal diagrams
 * via sole ownership.
 */
export async function assertDiagramAccess(
  userId: string,
  diagramId: string,
): Promise<DiagramAccess> {
  const rows = await db
    .select({
      projectId: schema.diagram.projectId,
      personalProjectId: schema.diagram.personalProjectId,
    })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  if (!rows[0]) throw new Error("Not found");
  const parent = diagramParent(rows[0]);
  if (parent.kind === "personal") {
    await assertPersonalProjectAccess(userId, parent.personalProjectId);
    return { kind: "personal", personalProjectId: parent.personalProjectId };
  }
  const workspaceId = await assertProjectAccess(userId, parent.projectId);
  return { kind: "org", projectId: parent.projectId, workspaceId };
}
