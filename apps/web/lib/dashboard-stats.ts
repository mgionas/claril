"use server";

import { asc, count, eq, inArray } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { getActiveContext } from "@/lib/context";
import type { ProjectWithDiagrams } from "@/lib/diagram-actions";
import { listPersonalProjects } from "@/lib/personal-actions";
import { getUsageSummary } from "@/lib/ai-usage";
import { aggregateStats, type DashboardStats } from "@/lib/dashboard-stats-core";

/**
 * Org-wide projects-with-diagrams across ALL of the org's workspaces. Used to
 * aggregate the org dashboard stats. Two queries (projects, then diagrams keyed
 * by projectId) — no per-project round-trips.
 *
 * STOPGAP (W13 P4 Task 2): aggregates org-wide because the dashboard is not yet
 * workspace-scoped. Task 3 reworks the org dashboard around the workspace
 * overview and will scope/replace this.
 */
async function listOrgProjectsWithDiagrams(orgId: string): Promise<ProjectWithDiagrams[]> {
  const projects = await db
    .select({
      id: schema.project.id,
      name: schema.project.name,
      description: schema.project.description,
      updatedAt: schema.project.updatedAt,
    })
    .from(schema.project)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.project.workspaceId))
    .where(eq(schema.workspace.organizationId, orgId));
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const diagrams = await db
    .select({
      id: schema.diagram.id,
      projectId: schema.diagram.projectId,
      name: schema.diagram.name,
      type: schema.diagram.type,
      updatedAt: schema.diagram.updatedAt,
    })
    .from(schema.diagram)
    .where(inArray(schema.diagram.projectId, projectIds))
    .orderBy(asc(schema.diagram.name));

  const byProject = new Map<string, ProjectWithDiagrams["diagrams"]>();
  for (const d of diagrams) {
    if (!d.projectId) continue;
    const list = byProject.get(d.projectId) ?? [];
    list.push({ id: d.id, name: d.name, type: d.type, updatedAt: d.updatedAt.toISOString() });
    byProject.set(d.projectId, list);
  }

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    updatedAt: p.updatedAt.toISOString(),
    diagrams: byProject.get(p.id) ?? [],
  }));
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (ctx.kind === "personal") {
    return { scope: "personal", ...aggregateStats(await listPersonalProjects()) };
  }
  const [core, usage, members] = await Promise.all([
    listOrgProjectsWithDiagrams(ctx.orgId).then(aggregateStats),
    getUsageSummary(ctx.orgId),
    db.select({ n: count() }).from(schema.member).where(eq(schema.member.organizationId, ctx.orgId)),
  ]);
  return { scope: "org", ...core, usage, memberCount: members[0]?.n ?? 0 };
}
