import { describe, it, expect } from "vitest";
import { EditPlanSchema, orderOps, collectPlanRefs } from "./edit-plan";

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
