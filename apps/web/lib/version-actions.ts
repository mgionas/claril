"use server";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { requireUserId } from "@/lib/session";
import { assertDiagramAccess } from "@/lib/tenancy";
import type { VersionSource } from "@/lib/actions";

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

export interface VersionSummary {
  id: string;
  label: string | null;
  source: VersionSource;
  /** ISO timestamp; the client renders a relative time. */
  createdAt: string;
  /** Display name of the author, or null if the user was removed. */
  author: string | null;
}

/**
 * Insert a version from client-supplied XML, skipping when the content is
 * byte-identical to the latest existing version (avoids duplicate rows from
 * focus/blur churn). Used by the workbench auto-versioning coalescer and by
 * forced snapshots (AI apply / import / restore). Authorized.
 */
export async function autosnapshotVersion(
  diagramId: string,
  xml: string,
  source: VersionSource,
  label?: string,
): Promise<void> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);

  const latest = await db
    .select({ content: schema.version.content })
    .from(schema.version)
    .where(eq(schema.version.diagramId, diagramId))
    .orderBy(desc(schema.version.createdAt))
    .limit(1);
  if (latest[0]?.content === xml) return; // no-op: identical to last snapshot

  await db.insert(schema.version).values({
    id: randomUUID(),
    diagramId,
    content: xml,
    label: label ?? null,
    source,
    createdBy: userId,
  });
}

/** List a diagram's versions, newest first. Authorized. */
export async function listVersions(diagramId: string): Promise<VersionSummary[]> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);

  const rows = await db
    .select({
      id: schema.version.id,
      label: schema.version.label,
      source: schema.version.source,
      createdAt: schema.version.createdAt,
      createdBy: schema.version.createdBy,
      authorName: schema.user.name,
      authorEmail: schema.user.email,
    })
    .from(schema.version)
    .leftJoin(schema.user, eq(schema.user.id, schema.version.createdBy))
    .where(eq(schema.version.diagramId, diagramId))
    .orderBy(desc(schema.version.createdAt));

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    source: (r.source ?? "manual") as VersionSource,
    createdAt: r.createdAt.toISOString(),
    // Legacy rows have no author (null createdBy) → null. Otherwise prefer the
    // display name, fall back to the email prefix, then "Unknown" if the user
    // row was removed (set-null FK) but the version still records an authorId.
    author: r.createdBy
      ? (r.authorName ?? r.authorEmail?.split("@")[0] ?? "Unknown")
      : null,
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
      source: "restore",
      createdBy: userId,
    });
    await tx
      .update(schema.diagram)
      .set({ content: target.content, updatedAt: new Date() })
      .where(eq(schema.diagram.id, diagramId));
  });

  return target.content;
}
