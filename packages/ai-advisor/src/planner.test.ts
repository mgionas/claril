import { describe, it, expect } from "vitest";
import { buildPlannerPrompt } from "./planner";

describe("buildPlannerPrompt", () => {
  it("includes the instruction and the current element ids", () => {
    const prompt = buildPlannerPrompt({
      graph: {
        nodes: [{ id: "StartEvent_1", type: "startEvent", name: "Start" }],
        edges: [],
      } as any,
      findings: [],
      instruction: "add an end event after Start",
    });
    expect(prompt).toContain("add an end event after Start");
    expect(prompt).toContain("StartEvent_1");
  });
});
