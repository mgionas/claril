"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { requireUserId } from "@/lib/session";
import { assertDiagramAccess } from "@/lib/tenancy";

export interface EmbeddableDiagram {
  id: string;
  name: string;
  kind: string;
}

/**
 * BPMN diagrams the user can embed on this board: same parent project (org
 * project or personal project), not archived, not the board itself. The board
 * is access-gated via `assertDiagramAccess`; the returned rows share its
 * tenancy scope by construction so no further per-row check is needed.
 */
export async function getEmbeddableDiagrams(boardDiagramId: string): Promise<EmbeddableDiagram[]> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, boardDiagramId);

  const boardRows = await db
    .select({
      projectId: schema.diagram.projectId,
      personalProjectId: schema.diagram.personalProjectId,
    })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, boardDiagramId))
    .limit(1);
  const board = boardRows[0];
  if (!board) return [];

  const sameParent = board.projectId
    ? eq(schema.diagram.projectId, board.projectId)
    : eq(schema.diagram.personalProjectId, board.personalProjectId!);

  return db
    .select({ id: schema.diagram.id, name: schema.diagram.name, kind: schema.diagram.type })
    .from(schema.diagram)
    .where(
      and(
        sameParent,
        ne(schema.diagram.id, boardDiagramId),
        eq(schema.diagram.type, "bpmn"),
        isNull(schema.diagram.archivedAt),
      ),
    );
}

export interface EmbeddableDiagramContent {
  id: string;
  name: string;
  content: string;
  kind: string;
}

/** Access-gated read of a single diagram's content, for embedding or refresh. */
export async function getDiagramContentForEmbed(diagramId: string): Promise<EmbeddableDiagramContent> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);

  const rows = await db
    .select({
      id: schema.diagram.id,
      name: schema.diagram.name,
      content: schema.diagram.content,
      kind: schema.diagram.type,
    })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  const d = rows[0];
  if (!d) throw new Error("Diagram not found");
  return d;
}
