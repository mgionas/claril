import { cache } from "react";
import { getCurrentSession } from "@/lib/session";
import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";

/** Which scope the current request resolves against (personal vs an active org). */
export type ActiveContext =
  | { kind: "personal"; userId: string }
  | { kind: "org"; orgId: string };

/**
 * Pure: resolve the active context. Uses the active org only when the user is
 * still a member of it; otherwise (no active org, or stale membership) falls
 * back to the personal scope. No I/O.
 */
export function resolveActiveContext(
  userId: string,
  activeOrgId: string | null | undefined,
  memberOrgIds: string[],
): ActiveContext {
  if (activeOrgId && memberOrgIds.includes(activeOrgId)) return { kind: "org", orgId: activeOrgId };
  return { kind: "personal", userId };
}

/**
 * Resolve the active context for the current session, or null when unauthenticated.
 * Reads the session's `activeOrganizationId` and validates it against live
 * org memberships.
 */
export const getActiveContext = cache(async (): Promise<ActiveContext | null> => {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  const activeOrgId = session.session?.activeOrganizationId ?? null;
  const memberships = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId));
  return resolveActiveContext(
    userId,
    activeOrgId,
    memberships.map((m) => m.organizationId),
  );
});

/**
 * Require an active org context. Throws when unauthenticated or when the user
 * is in the personal scope (no active organization).
 */
export async function requireActiveOrg(): Promise<{ userId: string; orgId: string }> {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  const activeOrgId = session.session?.activeOrganizationId ?? null;
  const memberships = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId));
  const ctx = resolveActiveContext(
    userId,
    activeOrgId,
    memberships.map((m) => m.organizationId),
  );
  if (ctx.kind !== "org") throw new Error("No active organization.");
  return { userId, orgId: ctx.orgId };
}
