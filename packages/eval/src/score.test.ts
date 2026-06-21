import { describe, it, expect } from "vitest";
import { inspect, type ProcessGraph } from "@claril/logic-inspector";
import type { EditPlan } from "@claril/ai-advisor";
import { scoreCase } from "./score";
import type { EvalCase } from "./types";

// Minimal sound graph: start -> task -> end (real ProcessGraph shape:
// nodes {id,type,name?}, flows {id,sourceRef,targetRef}).
const graph: ProcessGraph = {
  nodes: [
    { id: "s", type: "startEvent", name: "Start" },
    { id: "t", type: "task", name: "Do" },
    { id: "e", type: "endEvent", name: "End" },
  ],
  flows: [
    { id: "f1", sourceRef: "s", targetRef: "t" },
    { id: "f2", sourceRef: "t", targetRef: "e" },
  ],
};

const baseCase = (over: Partial<EvalCase> = {}): EvalCase => ({
  id: "c",
  description: "",
  tags: [],
  baseBpmn: "",
  instruction: "add a step",
  ...over,
});

describe("scoreCase", () => {
  it("passes a valid, in-scope, sound, asserted plan", () => {
    const plan: EditPlan = { summary: "ok", ops: [] };
    const r = scoreCase(baseCase(), plan, graph, []);
    expect(r.validity).toBe(true);
    expect(r.scope).toBe(true);
    expect(r.soundness).toBe(true);
    expect(r.assertions).toBe(true);
    expect(r.applyOk).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.opCount).toBe(0);
    expect(r.problems).toEqual([]);
  });

  it("fails when an assertion is unmet", () => {
    const plan: EditPlan = { summary: "ok", ops: [] };
    const r = scoreCase(
      baseCase({ assert: () => ["expected a new gateway"] }),
      plan,
      graph,
      [],
    );
    expect(r.assertions).toBe(false);
    expect(r.pass).toBe(false);
    expect(r.problems.join(" ")).toContain("gateway");
  });

  it("marks soundness false when the plan introduces a structural error", () => {
    // Deleting the only end event makes the result graph have no end event —
    // a NEW error-severity finding the base graph didn't have.
    const plan: EditPlan = {
      summary: "remove the end event",
      // instruction below uses "remove" so checkPlanScope stays satisfied.
      ops: [{ kind: "deleteElement", elementId: "e" }],
    };
    const baselineFindings = inspect(graph); // sound base → no errors
    const r = scoreCase(
      baseCase({ instruction: "remove the end event" }),
      plan,
      graph,
      baselineFindings,
    );
    expect(r.applyOk).toBe(true);
    expect(r.validity).toBe(true);
    expect(r.scope).toBe(true);
    expect(r.soundness).toBe(false);
    expect(r.pass).toBe(false);
    expect(r.problems.join(" ")).toContain("soundness");
  });
});
