"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, eq, inArray } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { requireActiveOrg } from "@/lib/context";
import { requireWorkspaceRole } from "@/lib/tenancy";

/**
 * Workspace + workspace-member server actions (W13 P4). Every mutation is
 * role-gated via {@link requireWorkspaceRole}; creation is org owner/admin only.
 * All reads/writes are scoped to the caller's active org so a member of one org
 * can never touch another's workspaces.
 */

type WsRole = "admin" | "editor" | "viewer" | "member";
type AssignableWsRole = "admin" | "editor" | "viewer";

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: WsRole;
  projectCount: number;
  diagramCount: number;
}

export interface WorkspaceMemberView {
  userId: string;
  name: string;
  email: string;
  role: WsRole;
}

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

/** Resolve the caller's org role within `orgId` (null if not a member). */
async function orgRoleFor(userId: string, orgId: string): Promise<string | null> {
  const row = (
    await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
      .limit(1)
  )[0];
  return row?.role ?? null;
}

/**
 * Workspaces visible to the caller in their active org:
 *  - Org owner/admin → ALL org workspaces (effective role "admin").
 *  - Otherwise → only workspaces with a `workspace_member` row for the user
 *    (effective role from that row).
 *
 * Project + diagram counts are attached with two grouped queries keyed by
 * workspaceId (no per-workspace round-trips → no N+1).
 */
export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const { userId, orgId } = await requireActiveOrg();
  const role = await orgRoleFor(userId, orgId);
  const isOrgAdmin = role === "owner" || role === "admin";

  // Resolve the visible workspaces (+ each one's effective role).
  let rows: { id: string; name: string; role: WsRole }[];
  if (isOrgAdmin) {
    const wss = await db
      .select({ id: schema.workspace.id, name: schema.workspace.name })
      .from(schema.workspace)
      .where(eq(schema.workspace.organizationId, orgId));
    rows = wss.map((w) => ({ id: w.id, name: w.name, role: "admin" as const }));
  } else {
    const wss = await db
      .select({
        id: schema.workspace.id,
        name: schema.workspace.name,
        role: schema.workspaceMember.role,
      })
      .from(schema.workspaceMember)
      .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
      .where(
        and(
          eq(schema.workspaceMember.userId, userId),
          eq(schema.workspace.organizationId, orgId),
        ),
      );
    rows = wss.map((w) => ({ id: w.id, name: w.name, role: w.role as WsRole }));
  }

  if (rows.length === 0) return [];
  const workspaceIds = rows.map((r) => r.id);

  // Grouped project counts keyed by workspaceId.
  const projectRows = await db
    .select({ workspaceId: schema.project.workspaceId, n: count() })
    .from(schema.project)
    .where(inArray(schema.project.workspaceId, workspaceIds))
    .groupBy(schema.project.workspaceId);
  const projectCounts = new Map(projectRows.map((r) => [r.workspaceId, Number(r.n)]));

  // Grouped diagram counts (diagrams join their project → workspace).
  const diagramRows = await db
    .select({ workspaceId: schema.project.workspaceId, n: count() })
    .from(schema.diagram)
    .innerJoin(schema.project, eq(schema.project.id, schema.diagram.projectId))
    .where(inArray(schema.project.workspaceId, workspaceIds))
    .groupBy(schema.project.workspaceId);
  const diagramCounts = new Map(diagramRows.map((r) => [r.workspaceId, Number(r.n)]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    projectCount: projectCounts.get(r.id) ?? 0,
    diagramCount: diagramCounts.get(r.id) ?? 0,
  }));
}

/**
 * Create a workspace in the active org. Org owners/admins only. The creator is
 * added as a workspace admin so they keep access even without org-admin rights.
 */
export async function createWorkspace(name: string): Promise<{ id: string }> {
  const { userId, orgId } = await requireActiveOrg();
  const role = await orgRoleFor(userId, orgId);
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only organization owners or admins can create workspaces.");
  }
  const id = randomUUID();
  const trimmed = name.trim() || "Untitled workspace";
  await db.transaction(async (tx) => {
    await tx.insert(schema.workspace).values({
      id,
      organizationId: orgId,
      name: trimmed,
      slug: `ws-${randomUUID().slice(0, 8)}`,
    });
    await tx
      .insert(schema.workspaceMember)
      .values({ id: randomUUID(), workspaceId: id, userId, role: "admin" });
  });
  revalidatePath("/");
  revalidatePath(`/w/${id}`);
  return { id };
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  const userId = await requireUserId();
  await requireWorkspaceRole(userId, workspaceId, "manage");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  await db
    .update(schema.workspace)
    .set({ name: trimmed })
    .where(eq(schema.workspace.id, workspaceId));
  revalidatePath("/");
  revalidatePath(`/w/${workspaceId}`);
}

/** Delete a workspace. Projects, diagrams and members cascade via FK. */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const userId = await requireUserId();
  await requireWorkspaceRole(userId, workspaceId, "manage");
  await db.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  revalidatePath("/");
  revalidatePath(`/w/${workspaceId}`);
}

/** Members of a workspace (join workspace_member × user). Any viewer may read. */
export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberView[]> {
  const userId = await requireUserId();
  await requireWorkspaceRole(userId, workspaceId, "view");
  const rows = await db
    .select({
      userId: schema.workspaceMember.userId,
      role: schema.workspaceMember.role,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.workspaceMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .where(eq(schema.workspaceMember.workspaceId, workspaceId));
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role as WsRole,
  }));
}

/**
 * Add a workspace member by email. The user must already be a member of the
 * workspace's org. Upserts on the unique `(workspaceId, userId)` so re-adding an
 * existing member just updates their role.
 */
export async function addWorkspaceMember(
  workspaceId: string,
  email: string,
  role: AssignableWsRole,
): Promise<void> {
  const userId = await requireUserId();
  await requireWorkspaceRole(userId, workspaceId, "manage");

  const ws = (
    await db
      .select({ orgId: schema.workspace.organizationId })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, workspaceId))
      .limit(1)
  )[0];
  if (!ws) throw new Error("Not found");

  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Email is required.");

  const target = (
    await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, normalized))
      .limit(1)
  )[0];
  if (!target) throw new Error("No user with that email. Invite them to the organization first.");

  const isOrgMember = (
    await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, ws.orgId),
          eq(schema.member.userId, target.id),
        ),
      )
      .limit(1)
  )[0];
  if (!isOrgMember) {
    throw new Error("That user is not a member of this organization.");
  }

  await db
    .insert(schema.workspaceMember)
    .values({ id: randomUUID(), workspaceId, userId: target.id, role })
    .onConflictDoUpdate({
      target: [schema.workspaceMember.workspaceId, schema.workspaceMember.userId],
      set: { role },
    });

  revalidatePath("/");
  revalidatePath(`/w/${workspaceId}`);
}

export async function removeWorkspaceMember(
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  const userId = await requireUserId();
  await requireWorkspaceRole(userId, workspaceId, "manage");
  await db
    .delete(schema.workspaceMember)
    .where(
      and(
        eq(schema.workspaceMember.workspaceId, workspaceId),
        eq(schema.workspaceMember.userId, targetUserId),
      ),
    );
  revalidatePath("/");
  revalidatePath(`/w/${workspaceId}`);
}

export async function setWorkspaceMemberRole(
  workspaceId: string,
  targetUserId: string,
  role: AssignableWsRole,
): Promise<void> {
  const userId = await requireUserId();
  await requireWorkspaceRole(userId, workspaceId, "manage");
  await db
    .update(schema.workspaceMember)
    .set({ role })
    .where(
      and(
        eq(schema.workspaceMember.workspaceId, workspaceId),
        eq(schema.workspaceMember.userId, targetUserId),
      ),
    );
  revalidatePath("/");
  revalidatePath(`/w/${workspaceId}`);
}
