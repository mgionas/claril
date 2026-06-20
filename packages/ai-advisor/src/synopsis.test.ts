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

const pooledGraph = {
  nodes: [
    { id: "Start_1", type: "startEvent", name: "Begin", lane: "Clerk", pool: "Back office" },
    { id: "Task_1", type: "task", name: "Review request", lane: "Clerk", pool: "Back office" },
    { id: "Task_2", type: "task", name: "Notify customer", lane: "Comms", pool: "Back office" },
  ],
  flows: [{ sourceRef: "Start_1", targetRef: "Task_1" }],
  lanes: [
    { id: "Lane_a", name: "Clerk", pool: "Back office", nodeIds: ["Start_1", "Task_1"] },
    { id: "Lane_b", name: "Comms", pool: "Back office", nodeIds: ["Task_2"] },
  ],
  pools: [{ id: "Pool_1", name: "Back office" }],
  messageFlows: [{ id: "MF_1", sourceRef: "Task_2", targetRef: "Start_1", name: "ack" }],
};

describe("describeSynopsis with pools/lanes/message flows", () => {
  it("lists pools and lanes with their members", () => {
    const s = describeSynopsis(pooledGraph as never);
    expect(s).toContain("POOLS & LANES");
    expect(s).toContain("Back office");
    expect(s).toContain('Lane "Clerk"');
    expect(s).toContain("Review request"); // lane member rendered by name
  });
  it("renders message flows and annotates the id table with lanes", () => {
    const s = describeSynopsis(pooledGraph as never);
    expect(s).toContain("MESSAGE FLOWS");
    expect(s).toContain("ack");
    expect(s).toContain("[lane: Clerk]");
  });
});

describe("graphHash with lanes/message flows", () => {
  it("changes when a node's lane changes", () => {
    const moved = {
      ...pooledGraph,
      nodes: pooledGraph.nodes.map((n) =>
        n.id === "Task_1" ? { ...n, lane: "Comms" } : n,
      ),
    };
    expect(graphHash(moved as never)).not.toBe(graphHash(pooledGraph as never));
  });
  it("changes when a message flow is added", () => {
    const withMf = {
      ...pooledGraph,
      messageFlows: [
        ...pooledGraph.messageFlows,
        { id: "MF_2", sourceRef: "Start_1", targetRef: "Task_2", name: "req" },
      ],
    };
    expect(graphHash(withMf as never)).not.toBe(graphHash(pooledGraph as never));
  });
});
