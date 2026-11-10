"use server";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { diagramContext } from "@/lib/ai";
import { requireUserId } from "@/lib/session";
import { assertDiagramAccess } from "@/lib/tenancy";
import { groupRelationsByAsset, type RelatedGroup, type RelationRow } from "@/lib/related";

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

/** Related diagrams by shared catalog asset. Org-scoped; [] for personal or no bindings. */
export async function getRelatedForDiagram(diagramId: string): Promise<RelatedGroup[]> {
  const userId = await requireUserId();
  const { ctx, orgId } = await diagramContext(userId, diagramId);
  if (ctx.kind !== "org" || !orgId) return []; // assets are org-only

  // 1. assets bound in this diagram
  const mine = await db
    .select({ assetId: schema.elementAssetBinding.assetId })
    .from(schema.elementAssetBinding)
    .where(
      and(
        eq(schema.elementAssetBinding.diagramId, diagramId),
        eq(schema.elementAssetBinding.organizationId, orgId),
      ),
    );
  const assetIds = [...new Set(mine.map((m) => m.assetId))];
  if (assetIds.length === 0) return [];

  // 2. all bindings of those assets across diagrams, with names/kinds
  const rows = await db
    .select({
      assetId: schema.elementAssetBinding.assetId,
      assetName: schema.asset.name,
      diagramId: schema.elementAssetBinding.diagramId,
      diagramName: schema.diagram.name,
      diagramKind: schema.diagram.type,
      elementId: schema.elementAssetBinding.elementId,
    })
    .from(schema.elementAssetBinding)
    .innerJoin(schema.asset, eq(schema.elementAssetBinding.assetId, schema.asset.id))
    .innerJoin(schema.diagram, eq(schema.elementAssetBinding.diagramId, schema.diagram.id))
    .where(
      and(
        eq(schema.elementAssetBinding.organizationId, orgId),
        inArray(schema.elementAssetBinding.assetId, assetIds),
      ),
    );

  return groupRelationsByAsset(rows as RelationRow[], diagramId);
}
