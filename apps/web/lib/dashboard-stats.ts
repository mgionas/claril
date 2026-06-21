"use server";

import { count, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { getActiveContext } from "@/lib/context";
import { listProjects } from "@/lib/diagram-actions";
import { listPersonalProjects } from "@/lib/personal-actions";
import { getUsageSummary } from "@/lib/ai-usage";
import { aggregateStats, type DashboardStats } from "@/lib/dashboard-stats-core";

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (ctx.kind === "personal") {
    return { scope: "personal", ...aggregateStats(await listPersonalProjects()) };
  }
  const [core, usage, members] = await Promise.all([
    listProjects().then(aggregateStats),
    getUsageSummary(ctx.orgId),
    db.select({ n: count() }).from(schema.member).where(eq(schema.member.organizationId, ctx.orgId)),
  ]);
  return { scope: "org", ...core, usage, memberCount: members[0]?.n ?? 0 };
}
