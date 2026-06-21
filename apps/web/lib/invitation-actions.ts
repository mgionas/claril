"use server";

import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";

/**
 * Pending organization invitations addressed to the current user, surfaced in
 * the notification bell so an invitee — including a brand-new personal account
 * with no org — can see and accept them in-app (we send no invite emails).
 * Best-effort and read-only: accept/reject happen client-side via the Better
 * Auth org client.
 */
export interface InvitationView {
  id: string;
  organizationId: string;
  organizationName: string;
  inviterName: string;
  role: string | null;
  createdAt: string;
}

export async function listMyInvitations(): Promise<InvitationView[]> {
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email;
  if (!email) return [];

  const rows = await db
    .select({
      id: schema.invitation.id,
      organizationId: schema.invitation.organizationId,
      organizationName: schema.organization.name,
      role: schema.invitation.role,
      createdAt: schema.invitation.createdAt,
      inviterName: schema.user.name,
    })
    .from(schema.invitation)
    .innerJoin(
      schema.organization,
      eq(schema.organization.id, schema.invitation.organizationId),
    )
    .leftJoin(schema.user, eq(schema.user.id, schema.invitation.inviterId))
    .where(
      and(
        eq(schema.invitation.email, email),
        eq(schema.invitation.status, "pending"),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    organizationName: r.organizationName,
    inviterName: r.inviterName ?? "Someone",
    role: r.role,
    createdAt: r.createdAt.toISOString(),
  }));
}
