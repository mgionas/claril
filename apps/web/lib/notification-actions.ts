"use server";

import { headers } from "next/headers";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";

/**
 * In-app notification server actions (W16). All reads/writes are scoped to the
 * current user (recipient); a caller can only ever see or mark their own rows.
 */

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

export interface NotificationView {
  id: string;
  type: "mention" | "reply" | "resolved";
  actor: { name: string; image: string | null };
  diagramId: string;
  diagramName: string;
  threadId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Count the current user's unread notifications. */
export async function getUnreadCount(): Promise<number> {
  const userId = await requireUserId();
  const rows = await db
    .select({ n: count() })
    .from(schema.notification)
    .where(and(eq(schema.notification.userId, userId), isNull(schema.notification.readAt)));
  return Number(rows[0]?.n ?? 0);
}

/** List the current user's notifications, newest first, with actor + diagram detail. */
export async function listNotifications(limit = 30): Promise<NotificationView[]> {
  const userId = await requireUserId();
  const rows = await db
    .select({
      id: schema.notification.id,
      type: schema.notification.type,
      diagramId: schema.notification.diagramId,
      threadId: schema.notification.threadId,
      readAt: schema.notification.readAt,
      createdAt: schema.notification.createdAt,
      actorName: schema.user.name,
      actorImage: schema.user.image,
      diagramName: schema.diagram.name,
    })
    .from(schema.notification)
    .innerJoin(schema.user, eq(schema.user.id, schema.notification.actorId))
    .innerJoin(schema.diagram, eq(schema.diagram.id, schema.notification.diagramId))
    .where(eq(schema.notification.userId, userId))
    .orderBy(desc(schema.notification.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actor: { name: r.actorName, image: r.actorImage },
    diagramId: r.diagramId,
    diagramName: r.diagramName,
    threadId: r.threadId,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Mark the given notifications (or all of the user's) read. */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const userId = await requireUserId();
  const now = new Date();
  if (ids && ids.length === 0) return;
  await db
    .update(schema.notification)
    .set({ readAt: now })
    .where(
      ids
        ? and(
            eq(schema.notification.userId, userId),
            inArray(schema.notification.id, ids),
          )
        : eq(schema.notification.userId, userId),
    );
}
