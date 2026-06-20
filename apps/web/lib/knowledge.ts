import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { graphHash, describeSynopsis } from "@claril/ai-advisor";
import type { ProcessGraph } from "@claril/logic-inspector";

/**
 * Return a compact process synopsis for grounding, reusing the cached row when
 * the graph hash matches and refreshing it otherwise. Best-effort: on any DB
 * error (e.g. table absent pre-migration) it falls back to computing the
 * synopsis in-memory without persisting.
 */
export async function getOrRefreshSynopsis(
  diagramId: string | undefined,
  graph: ProcessGraph,
  model: string,
): Promise<string> {
  const hash = graphHash(graph);
  if (!diagramId) return describeSynopsis(graph);
  try {
    const rows = await db
      .select({ summary: schema.diagramKnowledge.summary, graphHash: schema.diagramKnowledge.graphHash })
      .from(schema.diagramKnowledge)
      .where(eq(schema.diagramKnowledge.diagramId, diagramId))
      .limit(1);
    if (rows[0]?.graphHash === hash) return rows[0].summary;

    const summary = describeSynopsis(graph);
    await db
      .insert(schema.diagramKnowledge)
      .values({ diagramId, summary, graphHash: hash, model, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.diagramKnowledge.diagramId,
        set: { summary, graphHash: hash, model, updatedAt: new Date() },
      });
    return summary;
  } catch {
    return describeSynopsis(graph);
  }
}
