"use server";

import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { assertDiagramAccess } from "@/lib/tenancy";

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

/** A persisted chat message (shape mirrors the AI SDK UIMessage we store). */
export interface StoredChatMessage {
  id: string;
  role: string;
  parts: unknown;
}

/** Load a diagram's chat transcript, oldest first. Best-effort: [] on missing table. */
export async function getChatMessages(diagramId: string): Promise<StoredChatMessage[]> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  try {
    const rows = await db
      .select({ id: schema.chatMessage.id, role: schema.chatMessage.role, parts: schema.chatMessage.parts })
      .from(schema.chatMessage)
      .where(eq(schema.chatMessage.diagramId, diagramId))
      .orderBy(asc(schema.chatMessage.createdAt));
    return rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts }));
  } catch {
    return [];
  }
}

/** Append messages (idempotent on id via onConflictDoNothing). Best-effort. */
export async function appendChatMessages(
  diagramId: string,
  messages: { id: string; role: string; parts: unknown }[],
): Promise<void> {
  if (messages.length === 0) return;
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  try {
    await db
      .insert(schema.chatMessage)
      .values(
        messages.map((m) => ({
          id: m.id,
          diagramId,
          role: m.role,
          parts: m.parts as object,
        })),
      )
      .onConflictDoNothing();
  } catch {
    /* table may be absent pre-migration; ignore */
  }
}

/** Wipe a diagram's chat transcript. Best-effort. */
export async function clearChat(diagramId: string): Promise<void> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  try {
    await db.delete(schema.chatMessage).where(eq(schema.chatMessage.diagramId, diagramId));
  } catch {
    /* ignore */
  }
}
