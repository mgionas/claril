import { describe, it, expect } from "vitest";
import { inspect, type ProcessGraph } from "@claril/logic-inspector";
import { applyPlanToGraph } from "./plan-graph";
import type { EditPlan } from "./edit-plan";

const graph: ProcessGraph = {
  nodes: [
    { id: "Start_1", type: "startEvent", name: "Start" },
    { id: "Task_1", type: "task", name: "Money received" },
    { id: "End_1", type: "endEvent", name: "close case" },
  ],
  flows: [
    { id: "Flow_1", sourceRef: "Start_1", targetRef: "Task_1" },
    { id: "Flow_2", sourceRef: "Task_1", targetRef: "End_1" },
  ],
};

const errorCount = (g: ProcessGraph) => inspect(g).filter((f) => f.severity === "error").length;

describe("applyPlanToGraph", () => {
  it("clean insert (delete flow, add node, rewire) introduces no new errors", () => {
    const plan: EditPlan = {
      summary: "insert t1 between Task_1 and End_1",
      ops: [
        { kind: "deleteElement", elementId: "Flow_2" },
        { kind: "addNode", tempId: "t1", type: "task", name: "Verify" },
        { kind: "connect", fromRef: "Task_1", toRef: "t1", flow: "sequence" },
        { kind: "connect", fromRef: "t1", toRef: "End_1", flow: "sequence" },
      ],
    };
    const result = applyPlanToGraph(graph, plan);

    // Structure: the new node exists, the split flow is gone, both new flows are present.
    expect(result.nodes.map((n) => n.id)).toContain("t1");
    expect(result.flows.some((f) => f.id === "Flow_2")).toBe(false);
    expect(result.flows.some((f) => f.sourceRef === "Task_1" && f.targetRef === "t1")).toBe(true);
    expect(result.flows.some((f) => f.sourceRef === "t1" && f.targetRef === "End_1")).toBe(true);

    // Soundness: no NEW error vs the baseline.
    expect(errorCount(result)).toBeLessThanOrEqual(errorCount(graph));
  });

  it("adding a node with only an incoming flow yields more error-severity findings", () => {
    // Delete Task_1 -> End_1, wire Task_1 -> t1 only. End_1 becomes unreachable
    // and t1 is a dead-end: the result is unsound.
    const plan: EditPlan = {
      summary: "add t1 after Task_1, no outgoing",
      ops: [
        { kind: "deleteElement", elementId: "Flow_2" },
        { kind: "addNode", tempId: "t1", type: "task", name: "Dangling" },
        { kind: "connect", fromRef: "Task_1", toRef: "t1", flow: "sequence" },
      ],
    };
    const result = applyPlanToGraph(graph, plan);

    // Structure: the simulated graph contains the new node and the new flow.
    expect(result.nodes.map((n) => n.id)).toContain("t1");
    expect(result.flows.some((f) => f.sourceRef === "Task_1" && f.targetRef === "t1")).toBe(true);

    // Soundness: strictly more error-severity findings than the baseline.
    expect(errorCount(result)).toBeGreaterThan(errorCount(graph));
  });
});
