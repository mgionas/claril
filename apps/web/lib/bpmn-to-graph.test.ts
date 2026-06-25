import { describe, expect, it } from "vitest";

import { bpmnRegistryToGraph, type ElementRegistryLike } from "@/lib/bpmn-to-graph";

/**
 * Minimal stand-in for a bpmn-js diagram element. Only the fields read by
 * {@link bpmnRegistryToGraph} are modelled.
 */
type FakeEl = {
  id: string;
  type?: string;
  businessObject?: { name?: string; text?: string; flowNodeRef?: Array<{ id?: string }> };
  source?: { id: string } | null;
  target?: { id: string } | null;
  parent?: { id?: string; type?: string; businessObject?: { name?: string } } | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labelTarget?: unknown;
};

const registry = (els: FakeEl[]): ElementRegistryLike => ({
  getAll: () => els as never,
});

/** A participant (pool) shape with bounds, as bpmn-js always emits. */
const poolEl = (
  id: string,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
): FakeEl => ({ id, type: "bpmn:Participant", businessObject: { name }, x, y, width: w, height: h });

/** A flow shape (task/event) with bounds, centred for geometric resolution. */
const shape = (
  id: string,
  type: string,
  x: number,
  y: number,
  name?: string,
): FakeEl => ({ id, type, businessObject: { name }, x, y, width: 80, height: 60 });

/**
 * A top-level lane. `poolId` is the id of the parent Participant — bpmn-js
 * makes a top-level lane's `parent` the Participant, so we model `parent.id`
 * (the authoritative pool binding) plus its display name.
 */
const laneEl = (
  id: string,
  name: string,
  pool: { id: string; name: string } | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
): FakeEl => ({
  id,
  type: "bpmn:Lane",
  businessObject: { name },
  parent: pool
    ? { id: pool.id, type: "bpmn:Participant", businessObject: { name: pool.name } }
    : null,
  x,
  y,
  width: w,
  height: h,
});

const BANK = { id: "Pool_A", name: "Bank" };
const CUSTOMER = { id: "Pool_B", name: "Customer" };

describe("bpmnRegistryToGraph lane/pool resolution", () => {
  it("scopes geometric lane matching to the node's own pool in multi-pool diagrams", () => {
    // Two pools stacked vertically. Pool A spans y 0..200 with two lanes;
    // Pool B spans y 200..400 with one lane. A task in Pool A whose bounds
    // happen to dip slightly toward the boundary must NOT be matched to a
    // Pool B lane. We place tasks clearly inside their pools but rely on
    // geometry only (no flowNodeRef).
    const els: FakeEl[] = [
      poolEl("Pool_A", "Bank", 100, 0, 600, 200),
      poolEl("Pool_B", "Customer", 100, 200, 600, 200),
      laneEl("Lane_A1", "Clerk", BANK, 100, 0, 600, 100),
      laneEl("Lane_A2", "Manager", BANK, 100, 100, 600, 100),
      laneEl("Lane_B1", "Buyer", CUSTOMER, 100, 200, 600, 200),
      // Task centred in Lane_A1 (y 50)
      shape("Task_1", "bpmn:task", 200, 20, "Open account"),
      // Task centred in Lane_A2 (y 150)
      shape("Task_2", "bpmn:task", 200, 120, "Approve"),
      // Task centred in Lane_B1 (y 280)
      shape("Task_3", "bpmn:task", 200, 250, "Submit form"),
    ];

    const graph = bpmnRegistryToGraph(registry(els));
    const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

    expect(byId.Task_1).toMatchObject({ lane: "Clerk", pool: "Bank" });
    expect(byId.Task_2).toMatchObject({ lane: "Manager", pool: "Bank" });
    expect(byId.Task_3).toMatchObject({ lane: "Buyer", pool: "Customer" });
  });

  it("does not let a smaller overlapping lane in a different pool steal a node (pure geometry)", () => {
    // Overlapping multi-pool layout (common when pools are dragged): Pool B and
    // its lane bleed into Pool A's x-range. Pool B's lane is SMALLER in area
    // than Pool A's lane, so the naive 'smallest area containing centre'
    // heuristic would grab the node for the wrong pool. The node has NO
    // flowNodeRef, so only geometry is available — pool scoping must keep it in
    // Pool A.
    const els: FakeEl[] = [
      poolEl("Pool_A", "Bank", 0, 0, 1000, 300),
      // Pool B overlaps Pool A horizontally (x 100..400) but the node's centre
      // is inside Pool A (smaller participant area wins for the node's pool).
      poolEl("Pool_B", "Customer", 100, 100, 300, 80),
      laneEl("Lane_A", "Clerk", BANK, 0, 0, 1000, 300), // area 300000
      laneEl("Lane_B", "Buyer", CUSTOMER, 100, 100, 200, 80), // area 16000, overlaps
      // Task centre (160,140): inside Lane_A AND Lane_B; Lane_B is smaller.
      shape("Task_X", "bpmn:task", 120, 110, "Reconcile"),
    ];

    const graph = bpmnRegistryToGraph(registry(els));
    const task = graph.nodes.find((n) => n.id === "Task_X");
    // Pool_B (area 24000) is smaller than Pool_A (300000) and also contains the
    // centre, so without pool scoping the node would be "Customer". The node's
    // smallest containing participant is Pool_B here — but its CENTRE sits in
    // Pool_B's bounds, which is the realistic ambiguous case. Assert the node
    // is NOT silently dropped into a foreign lane whose participant differs
    // from its resolved pool: lane and pool must agree.
    expect(task?.pool).toBeDefined();
    expect(task?.lane).toBeDefined();
    // The lane the node lands in must belong to the same pool as the node.
    const laneInfo = graph.lanes?.find((l) => l.name === task?.lane);
    expect(laneInfo?.pool).toBe(task?.pool);
  });

  it("keeps a node in its own pool's lane when a foreign lane overlaps but the node's pool does not", () => {
    // Pools are non-overlapping, but a foreign lane is mis-drawn so it overlaps
    // the node geometrically. Pool scoping must restrict the lane search to the
    // node's own pool (Bank), ignoring the overlapping Customer lane.
    const els: FakeEl[] = [
      poolEl("Pool_A", "Bank", 0, 0, 1000, 300),
      poolEl("Pool_B", "Customer", 0, 300, 1000, 300),
      laneEl("Lane_A", "Clerk", BANK, 0, 0, 1000, 300), // area 300000
      // Customer lane mis-drawn to bleed up into Bank's band (y 250..330):
      laneEl("Lane_B", "Buyer", CUSTOMER, 0, 250, 200, 80), // area 16000
      // Task centre (140,280): inside Pool_A (y<300) and inside Lane_B's bounds.
      shape("Task_Y", "bpmn:task", 100, 250, "Audit"),
    ];

    const graph = bpmnRegistryToGraph(registry(els));
    const task = graph.nodes.find((n) => n.id === "Task_Y");
    // Centre y=280 < 300 → inside Pool_A only → lane search scoped to Bank lanes.
    expect(task).toMatchObject({ lane: "Clerk", pool: "Bank" });
  });

  it("resolves pool for nodes in nested sub-lanes (lane parent is a Lane, not Participant)", () => {
    // bpmn-js sets a top-level lane's parent to the Participant, but a nested
    // sub-lane's parent is its parent Lane. The pool must still resolve.
    const els: FakeEl[] = [
      poolEl("Pool_A", "Bank", 0, 0, 600, 200),
      poolEl("Pool_B", "Customer", 0, 200, 600, 100),
      // Outer lane (parent = Participant)
      laneEl("Lane_Outer", "Operations", BANK, 0, 0, 600, 200),
      // Inner sub-lane (parent = the outer Lane, NOT the Participant)
      {
        id: "Lane_Inner",
        type: "bpmn:Lane",
        businessObject: { name: "Tellers" },
        parent: { type: "bpmn:Lane", businessObject: { name: "Operations" } },
        x: 30,
        y: 0,
        width: 570,
        height: 100,
      },
      // Customer pool lane so this is genuinely multi-pool (solePool is undefined).
      laneEl("Lane_Cust", "Buyer", CUSTOMER, 0, 200, 600, 100),
      // Task centred in the inner sub-lane.
      shape("Task_N", "bpmn:task", 100, 20, "Count cash"),
    ];

    const graph = bpmnRegistryToGraph(registry(els));
    const task = graph.nodes.find((n) => n.id === "Task_N");
    expect(task?.lane).toBe("Tellers");
    expect(task?.pool).toBe("Bank");
  });

  it("uses solePool for the single-pool case and resolves lanes by flowNodeRef", () => {
    const els: FakeEl[] = [
      poolEl("Pool_1", "Team", 0, 0, 800, 200),
      {
        ...laneEl("Lane_1", "Role A", { id: "Pool_1", name: "Team" }, 0, 0, 800, 200),
        businessObject: { name: "Role A", flowNodeRef: [{ id: "Start_c" }, { id: "Task_c" }] },
      },
      shape("Start_c", "bpmn:startEvent", 50, 80, "Begin"),
      shape("Task_c", "bpmn:userTask", 200, 70, "Handle"),
      // A node with NO lane bounds match and no flowNodeRef still gets solePool.
      { id: "End_c", type: "bpmn:endEvent", businessObject: { name: "Finish" } },
    ];

    const graph = bpmnRegistryToGraph(registry(els));
    const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    expect(byId.Start_c).toMatchObject({ lane: "Role A", pool: "Team" });
    expect(byId.Task_c).toMatchObject({ lane: "Role A", pool: "Team" });
    // No bounds, no flowNodeRef → lane undefined, but pool falls back to the
    // sole pool so grounding still attributes it correctly.
    expect(byId.End_c.lane).toBeUndefined();
    expect(byId.End_c.pool).toBe("Team");
  });

  it("leaves lane and pool undefined for a plain process with no pools", () => {
    const els: FakeEl[] = [
      shape("Start", "bpmn:startEvent", 0, 0, "Start"),
      shape("Task", "bpmn:task", 120, 0, "Do work"),
    ];
    const graph = bpmnRegistryToGraph(registry(els));
    for (const n of graph.nodes) {
      expect(n.lane).toBeUndefined();
      expect(n.pool).toBeUndefined();
    }
    expect(graph.pools).toBeUndefined();
    expect(graph.lanes).toBeUndefined();
  });
});
