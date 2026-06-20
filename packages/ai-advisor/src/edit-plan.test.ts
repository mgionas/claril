import { describe, it, expect } from "vitest";
import { EditPlanSchema, orderOps, collectPlanRefs, validateEditPlan } from "./edit-plan";

const graph = {
  nodes: [
    { id: "Start_1", type: "startEvent", name: "Start" },
    { id: "Task_1", type: "task", name: "Money received" },
    { id: "End_1", type: "endEvent", name: "close case" },
  ],
  flows: [
    { id: "Flow_1", sourceRef: "Start_1", targetRef: "Task_1" },
    { id: "Flow_2", sourceRef: "Task_1", targetRef: "End_1" },
  ],
  lanes: [{ id: "Lane_back", name: "Back", nodeIds: [] }],
  pools: [],
} as never;

describe("validateEditPlan", () => {
  it("passes a clean insert plan", () => {
    const errors = validateEditPlan(
      {
        summary: "insert Inform Back",
        ops: [
          { kind: "deleteElement", elementId: "Flow_2" },
          { kind: "addNode", tempId: "t1", type: "task", name: "Inform Back" },
          { kind: "connect", fromRef: "Task_1", toRef: "t1", flow: "sequence" },
          { kind: "connect", fromRef: "t1", toRef: "End_1", flow: "sequence" },
        ],
      },
      graph,
    );
    expect(errors).toEqual([]);
  });

  it("flags an orphan (unconnected) added node", () => {
    const errors = validateEditPlan(
      { summary: "x", ops: [{ kind: "addNode", tempId: "t1", type: "task", name: "Inform Back" }] },
      graph,
    );
    expect(errors.some((e) => /not connected/.test(e))).toBe(true);
  });

  it("flags a connect to an unknown id", () => {
    const errors = validateEditPlan(
      {
        summary: "x",
        ops: [{ kind: "connect", fromRef: "Task_1", toRef: "Ghost_99", flow: "sequence" }],
      },
      graph,
    );
    expect(errors.some((e) => /Ghost_99/.test(e))).toBe(true);
  });

  it("accepts a containerRef given as a lane NAME", () => {
    const errors = validateEditPlan(
      { summary: "x", ops: [{ kind: "moveToContainer", elementId: "Task_1", containerRef: "Back" }] },
      graph,
    );
    expect(errors).toEqual([]);
  });

  it("flags an associate to an unknown ref", () => {
    const errors = validateEditPlan(
      { summary: "x", ops: [{ kind: "associate", fromRef: "Task_1", toRef: "Ghost_99" }] },
      graph,
    );
    expect(errors.some((e) => /Ghost_99/.test(e))).toBe(true);
  });

  it("accepts an addArtifact + associate against an existing element", () => {
    const errors = validateEditPlan(
      {
        summary: "add a data store and link it",
        ops: [
          { kind: "addArtifact", tempId: "a1", artifact: "dataStore", name: "Customer DB" },
          { kind: "associate", fromRef: "Task_1", toRef: "a1" },
        ],
      },
      graph,
    );
    expect(errors).toEqual([]);
  });
});

describe("EditPlanSchema", () => {
  it("accepts a valid plan and rejects an unknown op kind", () => {
    const ok = EditPlanSchema.safeParse({
      summary: "add a task",
      ops: [{ kind: "addNode", tempId: "t1", type: "task", name: "Do" }],
    });
    expect(ok.success).toBe(true);

    const bad = EditPlanSchema.safeParse({ summary: "x", ops: [{ kind: "frobnicate" }] });
    expect(bad.success).toBe(false);
  });

  it("accepts addArtifact + associate ops", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "add a data store and link it",
      ops: [
        { kind: "addArtifact", tempId: "a1", artifact: "dataStore", name: "Customer DB" },
        { kind: "associate", fromRef: "Task_1", toRef: "a1" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a moveToContainer op", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "Move task into the Back lane",
      ops: [{ kind: "moveToContainer", elementId: "Task_1", containerRef: "Lane_b" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts addNode for new task and gateway types", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "Add a send task and an inclusive gateway",
      ops: [
        { kind: "addNode", tempId: "t1", type: "sendTask", name: "Notify" },
        { kind: "addNode", tempId: "t2", type: "inclusiveGateway", name: "Which?" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a subProcess node + a child placed via containerRef", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "Add a subprocess with a task inside",
      ops: [
        { kind: "addNode", tempId: "sp", type: "subProcess", name: "Handle claim" },
        { kind: "addNode", tempId: "t1", type: "task", name: "Assess", containerRef: "sp" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a reconnect op", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "Re-point a flow",
      ops: [{ kind: "reconnect", flowId: "Flow_1", newTargetRef: "Task_2" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts conditional/default connect and setFlow", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "Add a conditional branch",
      ops: [
        { kind: "connect", fromRef: "Gw_1", toRef: "Task_2", flow: "sequence", condition: "amount > 1000" },
        { kind: "setFlow", flowId: "Flow_9", isDefault: true },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts addNode with an event definition", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "Add a timer boundary event",
      ops: [{ kind: "addNode", tempId: "t1", type: "intermediateCatchEvent", name: "Wait 2d", eventDefinition: "timer" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a setDocumentation op", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "Document the task",
      ops: [{ kind: "setDocumentation", elementId: "Task_1", text: "verifies the claim" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts activity markers", () => {
    const parsed = EditPlanSchema.safeParse({
      summary: "Make a task multi-instance",
      ops: [
        { kind: "addNode", tempId: "t1", type: "task", name: "Review", marker: "multiInstanceParallel" },
        { kind: "setMarker", elementId: "Task_2", marker: "loop" },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("orderOps", () => {
  it("orders pools → lanes → nodes → connects → updates → deletes", () => {
    const ordered = orderOps([
      { kind: "connect", fromRef: "a", toRef: "b", flow: "sequence" },
      { kind: "deleteElement", elementId: "Task_9" },
      { kind: "addLane", tempId: "l1", poolRef: "p1", name: "L" },
      { kind: "addNode", tempId: "a", type: "task" },
      { kind: "addPool", tempId: "p1", name: "P" },
      { kind: "updateElement", elementId: "Task_1", name: "R" },
    ]);
    expect(ordered.map((o) => o.kind)).toEqual([
      "addPool", "addLane", "addNode", "connect", "updateElement", "deleteElement",
    ]);
  });
});

describe("collectPlanRefs", () => {
  it("returns the tempIds a plan defines", () => {
    const refs = collectPlanRefs({
      summary: "",
      ops: [
        { kind: "addPool", tempId: "p1", name: "P" },
        { kind: "addNode", tempId: "n1", type: "task" },
      ],
    });
    expect(refs.defined).toEqual(new Set(["p1", "n1"]));
  });
});
