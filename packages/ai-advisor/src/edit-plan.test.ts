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
