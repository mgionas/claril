import { describe, expect, it } from "vitest";
import { graphHash, describeSynopsis } from "./synopsis";

const graph = {
  nodes: [
    { id: "Start_1", type: "startEvent", name: "Begin" },
    { id: "Task_1", type: "task", name: "Review request" },
    { id: "Gw_1", type: "exclusiveGateway", name: "Approved?" },
    { id: "End_1", type: "endEvent", name: "" },
  ],
  flows: [
    { sourceRef: "Start_1", targetRef: "Task_1" },
    { sourceRef: "Task_1", targetRef: "Gw_1" },
    { sourceRef: "Gw_1", targetRef: "End_1", name: "yes" },
  ],
};

describe("graphHash", () => {
  it("is stable for identical graphs and changes when the graph changes", () => {
    const h1 = graphHash(graph as never);
    const h2 = graphHash(graph as never);
    expect(h1).toBe(h2);
    const changed = { ...graph, nodes: [...graph.nodes, { id: "Task_2", type: "task", name: "Notify" }] };
    expect(graphHash(changed as never)).not.toBe(h1);
  });
});

describe("describeSynopsis", () => {
  it("includes counts and an id->name table for named elements", () => {
    const s = describeSynopsis(graph as never);
    expect(s).toContain("Task_1");
    expect(s).toContain("Review request");
    expect(s).toMatch(/gateway/i);
  });
  it("renders the sequence flows by name", () => {
    const s = describeSynopsis(graph as never);
    expect(s).toContain("Begin → Review request");
    expect(s).toMatch(/Approved\?/); // gateway name in decisions
    expect(s).toContain("yes"); // branch label
  });
  it("is non-empty", () => {
    expect(describeSynopsis(graph as never).length).toBeGreaterThan(0);
  });
});
