import { describe, it, expect } from "vitest";
import { buildPlannerPrompt, parseEditPlanResponse } from "./planner";

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

describe("parseEditPlanResponse", () => {
  const planJson = JSON.stringify({
    summary: "Add a check-user task before the check-case task",
    ops: [
      { kind: "addNode", tempId: "t1", type: "task", name: "Check user" },
      { kind: "connect", fromRef: "t1", toRef: "Task_CheckCase", flow: "sequence" },
    ],
  });

  it("parses a plain JSON object", () => {
    const plan = parseEditPlanResponse(planJson);
    expect(plan.ops).toHaveLength(2);
    expect(plan.ops[0]).toMatchObject({ kind: "addNode", type: "task" });
    expect(plan.ops[1]).toMatchObject({ kind: "connect", flow: "sequence" });
  });

  it("strips ```json code fences", () => {
    const plan = parseEditPlanResponse("```json\n" + planJson + "\n```");
    expect(plan.summary).toContain("check-user");
  });

  it("extracts the object when wrapped in prose", () => {
    const plan = parseEditPlanResponse(`Here is the plan:\n${planJson}\nLet me know!`);
    expect(plan.ops).toHaveLength(2);
  });

  it("throws on output with no JSON object", () => {
    expect(() => parseEditPlanResponse("I cannot do that.")).toThrow();
  });

  it("throws when the JSON fails schema validation", () => {
    expect(() =>
      parseEditPlanResponse(JSON.stringify({ summary: "x", ops: [{ kind: "bogus" }] })),
    ).toThrow();
  });
});
