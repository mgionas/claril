"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

/** Persist a diagram's content (debounced autosave from the canvas). */
export async function saveDiagramContent(diagramId: string, content: string): Promise<void> {
  await requireUserId();
  await db
    .update(schema.diagram)
    .set({ content, updatedAt: new Date() })
    .where(eq(schema.diagram.id, diagramId));
}

/** Snapshot the current content as a named version. */
export async function createDiagramVersion(diagramId: string, label?: string): Promise<void> {
  const userId = await requireUserId();
  const rows = await db
    .select({ content: schema.diagram.content })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  if (!rows[0]) return;
  await db.insert(schema.version).values({
    id: crypto.randomUUID(),
    diagramId,
    content: rows[0].content,
    label: label ?? null,
    createdBy: userId,
  });
}
