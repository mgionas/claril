"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { assertDiagramAccess } from "@/lib/tenancy";

/**
 * Diagram versioning server actions (W4). Every action authorizes the caller
 * against the diagram via {@link assertDiagramAccess} (tenancy chain: Org →
 * Workspace → Project → Diagram) so versions never leak across tenants.
 *
 * The `createDiagramVersion` snapshot action already lives in `lib/actions.ts`
 * (it predates this file); listing, restore and per-version content reads live
 * here. Restore is itself undoable: it snapshots the current content as an
 * automatic version before overwriting.
 */

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

export interface VersionSummary {
  id: string;
  label: string | null;
  /** ISO timestamp; the client renders a relative time. */
  createdAt: string;
  /** Display name of the author, or null if the user was removed. */
  author: string | null;
}

/** List a diagram's versions, newest first. Authorized. */
export async function listVersions(diagramId: string): Promise<VersionSummary[]> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);

  const rows = await db
    .select({
      id: schema.version.id,
      label: schema.version.label,
      createdAt: schema.version.createdAt,
      author: schema.user.name,
    })
    .from(schema.version)
    .leftJoin(schema.user, eq(schema.user.id, schema.version.createdBy))
    .where(eq(schema.version.diagramId, diagramId))
    .orderBy(desc(schema.version.createdAt));

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.createdAt.toISOString(),
    author: r.author ?? null,
  }));
}

/** Get the content snapshot of a single version (for the visual diff). Authorized. */
export async function getVersionContent(diagramId: string, versionId: string): Promise<string> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);

  const rows = await db
    .select({ content: schema.version.content, diagramId: schema.version.diagramId })
    .from(schema.version)
    .where(eq(schema.version.id, versionId))
    .limit(1);

  const row = rows[0];
  // Guard against a versionId that belongs to a different (authorized) diagram.
  if (!row || row.diagramId !== diagramId) throw new Error("Version not found");
  return row.content;
}

/**
 * Restore a version's snapshot as the diagram's current content. Snapshots the
 * pre-restore state first (label "Before restore") so the restore is undoable,
 * then overwrites the diagram content. Returns the restored content so the
 * caller can re-import it into the canvas. Authorized.
 */
export async function restoreVersion(diagramId: string, versionId: string): Promise<string> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);

  const versionRows = await db
    .select({ content: schema.version.content, diagramId: schema.version.diagramId })
    .from(schema.version)
    .where(eq(schema.version.id, versionId))
    .limit(1);
  const target = versionRows[0];
  if (!target || target.diagramId !== diagramId) throw new Error("Version not found");

  const currentRows = await db
    .select({ content: schema.diagram.content })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  const current = currentRows[0];
  if (!current) throw new Error("Diagram not found");

  await db.transaction(async (tx) => {
    // Auto-snapshot the pre-restore state so the restore can be reverted.
    await tx.insert(schema.version).values({
      id: randomUUID(),
      diagramId,
      content: current.content,
      label: "Before restore",
      createdBy: userId,
    });
    await tx
      .update(schema.diagram)
      .set({ content: target.content, updatedAt: new Date() })
      .where(eq(schema.diagram.id, diagramId));
  });

  return target.content;
}
