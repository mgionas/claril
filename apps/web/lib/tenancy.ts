import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";

/**
 * Tenancy resolution + authorization helpers, shared by the dashboard and the
 * diagram server actions. Tenancy chain: Organization → Workspace → Project →
 * Diagram. V1 resolves the user's first org/workspace; richer multi-workspace
 * selection is deferred.
 */

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
 * Ensure the org has a default workspace and that the user is a member of it,
 * creating either as needed. Idempotent. Returns the workspace id. Used when an
 * active-org context needs a concrete workspace to host projects/diagrams.
 */
export async function ensureWorkspaceForOrg(
  userId: string,
  organizationId: string,
): Promise<string> {
  const existing = await db
    .select({ id: schema.workspace.id })
    .from(schema.workspace)
    .where(eq(schema.workspace.organizationId, organizationId))
    .orderBy(asc(schema.workspace.createdAt))
    .limit(1);
  let workspaceId = existing[0]?.id;
  if (!workspaceId) {
    workspaceId = randomUUID();
    await db
      .insert(schema.workspace)
      .values({ id: workspaceId, organizationId, name: "My Workspace", slug: "default" });
  }
  const member = await db
    .select({ id: schema.workspaceMember.id })
    .from(schema.workspaceMember)
    .where(
      and(
        eq(schema.workspaceMember.workspaceId, workspaceId),
        eq(schema.workspaceMember.userId, userId),
      ),
    )
    .limit(1);
  if (!member[0]) {
    await db
      .insert(schema.workspaceMember)
      .values({ id: randomUUID(), workspaceId, userId, role: "admin" });
  }
  return workspaceId;
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

export type WorkspaceRole = "admin" | "editor" | "viewer" | "member"; // "member" = legacy ≈ editor
export type WorkspaceAction = "view" | "edit" | "manage";

/** Pure capability check for a workspace role. */
export function canDo(role: WorkspaceRole, action: WorkspaceAction): boolean {
  if (action === "view") return true;
  if (action === "edit") return role === "admin" || role === "editor" || role === "member";
  return role === "admin"; // "manage"
}

/** True when the user is an owner/admin of the org — implicitly admin on every workspace within it. */
async function isOrgAdmin(userId: string, organizationId: string): Promise<boolean> {
  const orgRole = (
    await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)))
      .limit(1)
  )[0]?.role;
  return orgRole === "owner" || orgRole === "admin";
}

/**
 * Resolve the user's effective role in a workspace and require at least `min`.
 * Org owners/admins are implicitly workspace admins. Throws "Not found" /
 * "Forbidden". Returns the effective role.
 */
export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  min: WorkspaceAction,
): Promise<WorkspaceRole> {
  const ws = (
    await db
      .select({ orgId: schema.workspace.organizationId })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, workspaceId))
      .limit(1)
  )[0];
  if (!ws) throw new Error("Not found");
  if (await isOrgAdmin(userId, ws.orgId)) {
    if (!canDo("admin", min)) throw new Error("Forbidden");
    return "admin";
  }
  const wm = (
    await db
      .select({ role: schema.workspaceMember.role })
      .from(schema.workspaceMember)
      .where(
        and(
          eq(schema.workspaceMember.workspaceId, workspaceId),
          eq(schema.workspaceMember.userId, userId),
        ),
      )
      .limit(1)
  )[0];
  if (!wm) throw new Error("Forbidden");
  const role = wm.role as WorkspaceRole;
  if (!canDo(role, min)) throw new Error("Forbidden");
  return role;
}

/**
 * Assert the user may access the given project (via its workspace). Returns the
 * project's workspaceId. Org owners/admins are implicitly admins on every
 * workspace in the org; otherwise an explicit workspace membership is required.
 * Throws if not authorized.
 */
export async function assertProjectAccess(userId: string, projectId: string): Promise<string> {
  const proj = (
    await db
      .select({
        workspaceId: schema.project.workspaceId,
        orgId: schema.workspace.organizationId,
      })
      .from(schema.project)
      .innerJoin(schema.workspace, eq(schema.workspace.id, schema.project.workspaceId))
      .where(eq(schema.project.id, projectId))
      .limit(1)
  )[0];
  if (!proj) throw new Error("Forbidden");
  if (await isOrgAdmin(userId, proj.orgId)) return proj.workspaceId;
  const wm = (
    await db
      .select({ id: schema.workspaceMember.id })
      .from(schema.workspaceMember)
      .where(
        and(
          eq(schema.workspaceMember.workspaceId, proj.workspaceId),
          eq(schema.workspaceMember.userId, userId),
        ),
      )
      .limit(1)
  )[0];
  if (!wm) throw new Error("Forbidden");
  return proj.workspaceId;
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
