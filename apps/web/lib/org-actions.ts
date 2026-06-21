"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { getUserOrgId } from "@/lib/ai";
import { requireUserId } from "@/lib/session";
import { ensureWorkspaceForOrg } from "@/lib/tenancy";

/**
 * Server-side reads for the settings area. Mutations (invite / role / remove /
 * org update) go through Better Auth's organization client methods, which gate
 * on role server-side. These read helpers resolve the user's active org the
 * same way the rest of the app does (`getUserOrgId`) so we don't depend on the
 * session's `activeOrganizationId` being set by the tenancy bootstrap.
 */

export type OrgRole = "owner" | "admin" | "member";

/**
 * Create an organization (the creator becomes its owner via Better Auth's
 * `creatorRole` default) plus its default workspace, then return the new org id.
 * The switcher calls this, then flips the active org to the returned id.
 */
export async function createOrgWithWorkspace(name: string): Promise<{ id: string }> {
  const userId = await requireUserId();
  const slug = `org-${randomUUID().slice(0, 8)}`;
  const org = await auth.api.createOrganization({
    body: { name: name.trim() || "Organization", slug },
    headers: await headers(),
  });
  if (!org) throw new Error("Could not create organization.");
  await ensureWorkspaceForOrg(userId, org.id);
  return { id: org.id };
}

export interface OrgOverview {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  /** The current user's role in this org. */
  viewerRole: OrgRole;
  canManage: boolean;
}

/** Active org overview for /settings/organization. Null if the user has none. */
export async function getOrgOverview(): Promise<OrgOverview | null> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  if (!orgId) return null;

  const [org] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      createdAt: schema.organization.createdAt,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, orgId))
    .limit(1);
  if (!org) return null;

  const members = await db
    .select({ role: schema.member.role, userId: schema.member.userId })
    .from(schema.member)
    .where(eq(schema.member.organizationId, orgId));

  const viewerRole = (members.find((m) => m.userId === userId)?.role ?? "member") as OrgRole;
  const canManage = viewerRole === "owner" || viewerRole === "admin";

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt.toISOString(),
    memberCount: members.length,
    viewerRole,
    canManage,
  };
}

export interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  isViewer: boolean;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: OrgRole;
  status: string;
  expiresAt: string;
}

export interface MembersView {
  orgId: string;
  viewerRole: OrgRole;
  canManage: boolean;
  members: MemberRow[];
  invitations: InvitationRow[];
}

/** Members + pending invitations for the active org. */
export async function getMembersView(): Promise<MembersView | null> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  if (!orgId) return null;

  const memberRows = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.member.organizationId, orgId));

  const viewerRole = (memberRows.find((m) => m.userId === userId)?.role ?? "member") as OrgRole;
  const canManage = viewerRole === "owner" || viewerRole === "admin";

  const members: MemberRow[] = memberRows
    .map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role as OrgRole,
      isViewer: m.userId === userId,
    }))
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));

  const inviteRows = await db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      role: schema.invitation.role,
      status: schema.invitation.status,
      expiresAt: schema.invitation.expiresAt,
    })
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.organizationId, orgId),
        eq(schema.invitation.status, "pending"),
      ),
    );

  const invitations: InvitationRow[] = inviteRows.map((i) => ({
    id: i.id,
    email: i.email,
    role: (i.role ?? "member") as OrgRole,
    status: i.status,
    expiresAt: i.expiresAt.toISOString(),
  }));

  return { orgId, viewerRole, canManage, members, invitations };
}

function roleRank(role: OrgRole): number {
  return role === "owner" ? 0 : role === "admin" ? 1 : 2;
}
