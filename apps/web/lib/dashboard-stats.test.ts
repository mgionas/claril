import { describe, expect, it } from "vitest";
import { aggregateStats } from "./dashboard-stats-core";

const proj = (name: string, diagrams: { id: string; name: string; type: "bpmn" | "sequence" | "c4"; updatedAt: string }[]) =>
  ({ id: name, name, description: null, updatedAt: "2026-06-01T00:00:00.000Z", diagrams });

describe("aggregateStats", () => {
  it("returns zeros for no projects", () => {
    expect(aggregateStats([])).toEqual({
      projectCount: 0, diagramCount: 0,
      diagramsByType: { bpmn: 0, sequence: 0, c4: 0 }, recent: [],
    });
  });
  it("counts projects + diagrams by type and surfaces recent (newest first, capped)", () => {
    const s = aggregateStats([
      proj("A", [
        { id: "d1", name: "Flow", type: "bpmn", updatedAt: "2026-06-02T00:00:00.000Z" },
        { id: "d2", name: "Seq", type: "sequence", updatedAt: "2026-06-05T00:00:00.000Z" },
      ]),
      proj("B", [{ id: "d3", name: "Ctx", type: "c4", updatedAt: "2026-06-03T00:00:00.000Z" }]),
    ]);
    expect(s.projectCount).toBe(2);
    expect(s.diagramCount).toBe(3);
    expect(s.diagramsByType).toEqual({ bpmn: 1, sequence: 1, c4: 1 });
    expect(s.recent.map((r) => r.id)).toEqual(["d2", "d3", "d1"]);
    expect(s.recent[0]).toMatchObject({ id: "d2", name: "Seq", type: "sequence", projectName: "A" });
  });
});
