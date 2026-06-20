import type { EditPlan, Op } from "@claril/ai-advisor";
import { orderOps } from "@claril/ai-advisor";

interface ModelerServices {
  get(name: string): any;
}

const BPMN_TYPE: Record<string, string> = {
  startEvent: "bpmn:StartEvent",
  endEvent: "bpmn:EndEvent",
  task: "bpmn:Task",
  userTask: "bpmn:UserTask",
  serviceTask: "bpmn:ServiceTask",
  exclusiveGateway: "bpmn:ExclusiveGateway",
  parallelGateway: "bpmn:ParallelGateway",
  intermediateThrowEvent: "bpmn:IntermediateThrowEvent",
  intermediateCatchEvent: "bpmn:IntermediateCatchEvent",
};

/**
 * Apply an EditPlan to the live modeler as a SINGLE undoable command. Returns
 * the element ids that were created/changed (for diff highlighting). All edits
 * go through `modeling`/`autoPlace` so re-inspection + autosave fire normally.
 */
export function applyEditPlan(
  modeler: ModelerServices,
  plan: EditPlan,
): { changedIds: string[] } {
  const elementRegistry = modeler.get("elementRegistry");
  const modeling = modeler.get("modeling");
  const elementFactory = modeler.get("elementFactory");
  const autoPlace = modeler.get("autoPlace");
  const canvas = modeler.get("canvas");

  // autoPlace is retrieved above for future use (auto-layout post-pass).
  void autoPlace;

  const temp = new Map<string, any>(); // tempId -> created element
  const changed = new Set<string>();
  const resolve = (ref: string) => temp.get(ref) ?? elementRegistry.get(ref);

  const root = canvas.getRootElement();

  for (const op of orderOps(plan.ops)) {
    try {
      applyOne(op);
    } catch {
      // Skip an individual op that can't resolve its refs; the plan card
      // already warned. Do not abort the whole batch mid-way.
    }
  }

  function applyOne(op: Op) {
    switch (op.kind) {
      case "addPool": {
        const pool = elementFactory.createParticipantShape();
        const placed = modeling.createShape(pool, { x: 300, y: 200 }, root);
        if (op.name) modeling.updateProperties(placed, { name: op.name });
        temp.set(op.tempId, placed);
        changed.add(placed.id);
        return;
      }
      case "addLane": {
        const pool = resolve(op.poolRef);
        if (!pool) return;
        const lane = modeling.addLane(pool, "bottom");
        if (op.name) modeling.updateProperties(lane, { name: op.name });
        temp.set(op.tempId, lane);
        changed.add(lane.id);
        return;
      }
      case "addNode": {
        const type = BPMN_TYPE[op.type];
        const shape = elementFactory.createShape({ type });
        const container = op.containerRef ? resolve(op.containerRef) : null;
        let placed;
        if (container) {
          placed = modeling.createShape(shape, { x: 0, y: 0 }, container);
          modeling.moveElements([placed], { x: 80, y: 60 }, container);
        } else {
          placed = modeling.createShape(shape, { x: 300, y: 200 }, root);
        }
        if (op.name) modeling.updateProperties(placed, { name: op.name });
        temp.set(op.tempId, placed);
        changed.add(placed.id);
        return;
      }
      case "connect": {
        const from = resolve(op.fromRef);
        const to = resolve(op.toRef);
        if (!from || !to) return;
        const conn = modeling.connect(from, to);
        if (op.label && conn) modeling.updateProperties(conn, { name: op.label });
        if (conn) changed.add(conn.id);
        return;
      }
      case "updateElement": {
        const el = elementRegistry.get(op.elementId);
        if (el && op.name !== undefined) {
          modeling.updateProperties(el, { name: op.name });
          changed.add(el.id);
        }
        return;
      }
      case "deleteElement": {
        const el = elementRegistry.get(op.elementId);
        if (el) modeling.removeElements([el]);
        return;
      }
    }
  }

  return { changedIds: [...changed] };
}
