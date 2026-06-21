import type { ProjectWithDiagrams } from "@/lib/diagram-actions";
import type { UsageSummary } from "@/lib/ai-usage";

export interface RecentDiagram {
  id: string;
  name: string;
  type: "bpmn" | "sequence" | "c4";
  projectName: string;
  updatedAt: string;
}

export interface DashboardStatsCore {
  projectCount: number;
  diagramCount: number;
  diagramsByType: { bpmn: number; sequence: number; c4: number };
  recent: RecentDiagram[];
}

export interface DashboardStats extends DashboardStatsCore {
  scope: "personal" | "org";
  memberCount?: number;
  usage?: UsageSummary;
}

export const RECENT_LIMIT = 6;

/** PURE: counts + by-type + recent (newest first, capped) from the scope's projects. No I/O. */
export function aggregateStats(projects: ProjectWithDiagrams[]): DashboardStatsCore {
  const diagramsByType = { bpmn: 0, sequence: 0, c4: 0 };
  let diagramCount = 0;
  const all: RecentDiagram[] = [];
  for (const p of projects) {
    for (const d of p.diagrams) {
      diagramCount += 1;
      diagramsByType[d.type] += 1;
      all.push({ id: d.id, name: d.name, type: d.type, projectName: p.name, updatedAt: d.updatedAt });
    }
  }
  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    projectCount: projects.length,
    diagramCount,
    diagramsByType,
    recent: all.slice(0, RECENT_LIMIT),
  };
}
