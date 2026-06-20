import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@claril/db";
import type { LanguageModelUsage } from "@claril/ai-advisor";

type UsageKind = "chat" | "advisor" | "docgen" | "plan" | "generate";

interface RecordArgs {
  organizationId: string;
  projectId?: string | null;
  diagramId?: string | null;
  kind: UsageKind;
  provider: string;
  model: string;
  usage?: LanguageModelUsage;
}

/** Best-effort: log a single AI call's token usage. Never throws. */
export async function recordAiUsage(args: RecordArgs): Promise<void> {
  try {
    await db.insert(schema.aiUsage).values({
      id: crypto.randomUUID(),
      organizationId: args.organizationId,
      projectId: args.projectId ?? null,
      diagramId: args.diagramId ?? null,
      kind: args.kind,
      provider: args.provider,
      model: args.model,
      inputTokens: args.usage?.inputTokens ?? 0,
      outputTokens: args.usage?.outputTokens ?? 0,
      totalTokens: args.usage?.totalTokens ?? 0,
    });
  } catch {
    // Usage accounting is non-critical; swallow so it never breaks an AI call.
  }
}

export interface UsageRow {
  label: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
}

export interface UsageSummary {
  totalTokens: number;
  byProject: UsageRow[];
  byModel: UsageRow[];
}

/**
 * Aggregate an org's usage, grouped by project name and by model. Best-effort:
 * if the `ai_usage` table is absent (migration not yet applied) this returns an
 * empty summary instead of throwing, so the settings page still renders.
 */
export async function getUsageSummary(organizationId: string): Promise<UsageSummary> {
  try {
    return await queryUsageSummary(organizationId);
  } catch {
    return { totalTokens: 0, byProject: [], byModel: [] };
  }
}

async function queryUsageSummary(organizationId: string): Promise<UsageSummary> {
  const byModelRows = await db
    .select({
      label: schema.aiUsage.model,
      inputTokens: sql<number>`coalesce(sum(${schema.aiUsage.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}),0)::int`,
      totalTokens: sql<number>`coalesce(sum(${schema.aiUsage.totalTokens}),0)::int`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.organizationId, organizationId))
    .groupBy(schema.aiUsage.model)
    .orderBy(desc(sql`sum(${schema.aiUsage.totalTokens})`));

  const byProjectRows = await db
    .select({
      label: sql<string>`coalesce(${schema.project.name}, 'Unattributed')`,
      inputTokens: sql<number>`coalesce(sum(${schema.aiUsage.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}),0)::int`,
      totalTokens: sql<number>`coalesce(sum(${schema.aiUsage.totalTokens}),0)::int`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.aiUsage)
    .leftJoin(schema.project, eq(schema.aiUsage.projectId, schema.project.id))
    .where(eq(schema.aiUsage.organizationId, organizationId))
    .groupBy(schema.project.name)
    .orderBy(desc(sql`sum(${schema.aiUsage.totalTokens})`));

  const totalTokens = byModelRows.reduce((n, r) => n + r.totalTokens, 0);
  return { totalTokens, byProject: byProjectRows, byModel: byModelRows };
}

/** Resolve a diagram's owning project (for usage attribution). */
export async function projectIdForDiagram(diagramId: string): Promise<string | null> {
  const rows = await db
    .select({ projectId: schema.diagram.projectId })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  return rows[0]?.projectId ?? null;
}
