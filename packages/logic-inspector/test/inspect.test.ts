import { describe, expect, it } from "vitest";
import { inspect } from "../src";
import type { ProcessGraph } from "../src";

/** start --f1--> task --f2--> end */
const validProcess: ProcessGraph = {
  id: "p1",
  nodes: [
    { id: "start", type: "startEvent" },
    { id: "task", type: "task", name: "Do work" },
    { id: "end", type: "endEvent" },
  ],
  flows: [
    { id: "f1", sourceRef: "start", targetRef: "task" },
    { id: "f2", sourceRef: "task", targetRef: "end" },
  ],
};

const ruleIds = (graph: ProcessGraph) => inspect(graph).map((finding) => finding.ruleId);

describe("logic inspector", () => {
  it("reports no findings for a well-formed process", () => {
    expect(inspect(validProcess)).toEqual([]);
  });

  it("flags a missing start event", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "task", type: "task" },
        { id: "end", type: "endEvent" },
      ],
      flows: [{ id: "f1", sourceRef: "task", targetRef: "end" }],
    };
    expect(ruleIds(graph)).toContain("structural/missing-start-event");
    // Should NOT also spam unreachable-node when there's no start at all.
    expect(ruleIds(graph)).not.toContain("structural/unreachable-node");
  });

  it("flags a missing end event", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "task", type: "task" },
      ],
      flows: [{ id: "f1", sourceRef: "start", targetRef: "task" }],
    };
    expect(ruleIds(graph)).toContain("structural/missing-end-event");
  });

  it("flags a dangling sequence flow", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "end", type: "endEvent" },
      ],
      flows: [
        { id: "f1", sourceRef: "start", targetRef: "ghost" },
        { id: "f2", sourceRef: "start", targetRef: "end" },
      ],
    };
    const dangling = inspect(graph).filter((f) => f.ruleId === "structural/dangling-flow");
    expect(dangling).toHaveLength(1);
    expect(dangling[0]?.elementId).toBe("f1");
  });

  it("flags an unreachable node", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "end", type: "endEvent" },
        { id: "orphan", type: "task", name: "Orphan" },
      ],
      flows: [{ id: "f1", sourceRef: "start", targetRef: "end" }],
    };
    const findings = inspect(graph).filter((f) => f.ruleId === "structural/unreachable-node");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.elementId).toBe("orphan");
  });

  it("flags a dead end (non-end node without outgoing flow)", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "task", type: "task", name: "Stuck" },
        { id: "end", type: "endEvent" },
      ],
      flows: [{ id: "f1", sourceRef: "start", targetRef: "task" }],
    };
    const deadEnds = inspect(graph).filter((f) => f.ruleId === "structural/dead-end");
    expect(deadEnds.map((f) => f.elementId)).toContain("task");
  });

  it("flags an implicit gateway (task with multiple outgoing flows)", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "task", type: "task", name: "Branch" },
        { id: "a", type: "endEvent" },
        { id: "b", type: "endEvent" },
      ],
      flows: [
        { id: "f1", sourceRef: "start", targetRef: "task" },
        { id: "f2", sourceRef: "task", targetRef: "a" },
        { id: "f3", sourceRef: "task", targetRef: "b" },
      ],
    };
    expect(ruleIds(graph)).toContain("best-practice/implicit-gateway");
  });

  it("flags an infinite loop (cycle with no exit)", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "a", type: "task", name: "A" },
        { id: "b", type: "task", name: "B" },
      ],
      flows: [
        { id: "f1", sourceRef: "start", targetRef: "a" },
        { id: "f2", sourceRef: "a", targetRef: "b" },
        { id: "f3", sourceRef: "b", targetRef: "a" },
      ],
    };
    expect(ruleIds(graph)).toContain("structural/infinite-loop");
  });

  it("does not flag a loop that has an exit", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "a", type: "task" },
        { id: "b", type: "exclusiveGateway", name: "Again?" },
        { id: "end", type: "endEvent" },
      ],
      flows: [
        { id: "f1", sourceRef: "start", targetRef: "a" },
        { id: "f2", sourceRef: "a", targetRef: "b" },
        { id: "f3", sourceRef: "b", targetRef: "a" },
        { id: "f4", sourceRef: "b", targetRef: "end" },
      ],
    };
    expect(ruleIds(graph)).not.toContain("structural/infinite-loop");
  });

  it("flags a mixed gateway (merges and splits)", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "a", type: "task" },
        { id: "b", type: "task" },
        { id: "g", type: "parallelGateway", name: "G" },
        { id: "e1", type: "endEvent" },
        { id: "e2", type: "endEvent" },
      ],
      flows: [
        { id: "f0", sourceRef: "start", targetRef: "a" },
        { id: "f0b", sourceRef: "start", targetRef: "b" },
        { id: "f1", sourceRef: "a", targetRef: "g" },
        { id: "f2", sourceRef: "b", targetRef: "g" },
        { id: "f3", sourceRef: "g", targetRef: "e1" },
        { id: "f4", sourceRef: "g", targetRef: "e2" },
      ],
    };
    expect(ruleIds(graph)).toContain("structural/mixed-gateway");
  });

  it("flags an implicit join (task with multiple incoming flows)", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "a", type: "task" },
        { id: "b", type: "task" },
        { id: "merge", type: "task", name: "Merge" },
        { id: "end", type: "endEvent" },
      ],
      flows: [
        { id: "f1", sourceRef: "start", targetRef: "a" },
        { id: "f2", sourceRef: "start", targetRef: "b" },
        { id: "f3", sourceRef: "a", targetRef: "merge" },
        { id: "f4", sourceRef: "b", targetRef: "merge" },
        { id: "f5", sourceRef: "merge", targetRef: "end" },
      ],
    };
    expect(ruleIds(graph)).toContain("best-practice/implicit-join");
  });

  it("flags an unlabeled decision gateway", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "start", type: "startEvent" },
        { id: "g", type: "exclusiveGateway" },
        { id: "e1", type: "endEvent" },
        { id: "e2", type: "endEvent" },
      ],
      flows: [
        { id: "f1", sourceRef: "start", targetRef: "g" },
        { id: "f2", sourceRef: "g", targetRef: "e1" },
        { id: "f3", sourceRef: "g", targetRef: "e2" },
      ],
    };
    expect(ruleIds(graph)).toContain("best-practice/unlabeled-gateway");
  });

  it("flags multiple start events", () => {
    const graph: ProcessGraph = {
      nodes: [
        { id: "s1", type: "startEvent" },
        { id: "s2", type: "startEvent" },
        { id: "t", type: "task" },
        { id: "end", type: "endEvent" },
      ],
      flows: [
        { id: "f1", sourceRef: "s1", targetRef: "t" },
        { id: "f2", sourceRef: "s2", targetRef: "t" },
        { id: "f3", sourceRef: "t", targetRef: "end" },
      ],
    };
    expect(ruleIds(graph)).toContain("best-practice/multiple-start-events");
  });
});
