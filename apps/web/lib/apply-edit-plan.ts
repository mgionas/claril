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

  const temp = new Map<string, any>(); // tempId -> created element
  const changed = new Set<string>();
  // connect ops already realized via autoPlace.append (skip them in the loop).
  const consumed = new Set<Op>();
  const resolve = (ref: string) => temp.get(ref) ?? elementRegistry.get(ref);

  const root = canvas.getRootElement();

  // A flow node can't be a direct child of a bpmn:Collaboration (the root when
  // the diagram has pools) — createShape onto it throws ("children.push" on
  // undefined). Descend into a participant so the target is always valid.
  const asFlowNodeContainer = (el: any) => {
    if (el?.businessObject?.$type === "bpmn:Collaboration") {
      const participant = (el.children ?? []).find(
        (c: any) => c?.businessObject?.$type === "bpmn:Participant",
      );
      return participant ?? el;
    }
    return el;
  };

  const center = (el: any) => ({
    x: el.x + (el.width ?? 100) / 2,
    y: el.y + (el.height ?? 80) / 2,
  });

  // The element connecting INTO this node ("in") or that this node connects TO
  // ("out"), so we can place an inserted node on the line between them and in
  // their pool/lane. Only returns positioned (already-placed) elements.
  const findNeighbor = (tempId: string, dir: "in" | "out"): any => {
    for (const o of plan.ops) {
      if (o.kind !== "connect") continue;
      const ref =
        dir === "in"
          ? o.toRef === tempId
            ? o.fromRef
            : null
          : o.fromRef === tempId
            ? o.toRef
            : null;
      if (!ref) continue;
      const el = resolve(ref);
      if (el && typeof el.x === "number") return el;
    }
    return null;
  };

  // The sequence-flow connect op feeding INTO this node from an already-placed
  // element, so we can let bpmn-js autoPlace append the node from it (free-space
  // placement in the right lane). Returns the op so the loop can skip it.
  const findIncomingConnect = (tempId: string): { op: Op; source: any } | null => {
    for (const o of plan.ops) {
      if (o.kind === "connect" && o.toRef === tempId && o.flow === "sequence") {
        const source = resolve(o.fromRef);
        if (source && typeof source.x === "number") return { op: o, source };
      }
    }
    return null;
  };

  // Walk up to the enclosing pool (participant), if any, so we can widen it
  // when we shift nodes right to make room for an insert.
  const findParticipant = (el: any): any => {
    let cur = el;
    while (cur) {
      if (cur.businessObject?.$type === "bpmn:Participant") return cur;
      cur = cur.parent;
    }
    return null;
  };

  // `start` plus every flow node reachable from it via outgoing sequence flows
  // (cycle-safe). Used to shift "everything after the insertion point" right.
  const collectDownstream = (start: any): any[] => {
    const seen = new Set<string>();
    const out: any[] = [];
    const stack = [start];
    while (stack.length) {
      const el = stack.pop();
      if (!el || seen.has(el.id)) continue;
      seen.add(el.id);
      out.push(el);
      for (const c of el.outgoing ?? []) {
        if (c.target && !seen.has(c.target.id)) stack.push(c.target);
      }
    }
    return out;
  };

  // Center position for an inserted node: midpoint of its predecessor and
  // successor when both are known (a clean insert on the existing line),
  // otherwise just beside whichever neighbour we have.
  const insertPosition = (pred: any, succ: any): { x: number; y: number } => {
    if (pred && succ) {
      const a = center(pred);
      const b = center(succ);
      return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
    }
    if (pred) return { x: pred.x + (pred.width ?? 100) + 110, y: center(pred).y };
    if (succ) return { x: succ.x - 110, y: center(succ).y };
    return { x: 300, y: 200 };
  };

  const DEBUG = process.env.NODE_ENV !== "production";
  if (DEBUG) console.log("[applyEditPlan] ops (ordered):", orderOps(plan.ops));

  for (const op of orderOps(plan.ops)) {
    try {
      applyOne(op);
    } catch (e) {
      if (DEBUG) console.log("[applyEditPlan] op threw:", op, e);
      // Skip an individual op that can't resolve its refs; the plan card
      // already warned. Do not abort the whole batch mid-way.
    }
  }

  if (DEBUG) console.log("[applyEditPlan] changedIds:", [...changed]);

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
        const explicit = op.containerRef ? resolve(op.containerRef) : null;
        const pred = explicit ? null : findNeighbor(op.tempId, "in");
        const succ = explicit ? null : findNeighbor(op.tempId, "out");
        let placed: any;

        if (!explicit && pred && succ && typeof succ.x === "number") {
          // INSERT between two nodes: open a slot by shifting the successor and
          // everything downstream right, widen the enclosing pool to fit, then
          // drop the new node into the gap the successor vacated.
          const dx = (shape.width ?? 100) + 60;
          const slot = center(succ); // capture BEFORE moving anything
          const participant = findParticipant(succ);
          if (participant && typeof participant.width === "number") {
            try {
              modeling.resizeShape(participant, {
                x: participant.x,
                y: participant.y,
                width: participant.width + dx,
                height: participant.height,
              });
            } catch {
              /* pool resize is best-effort */
            }
          }
          try {
            modeling.moveElements(collectDownstream(succ), { x: dx, y: 0 });
          } catch {
            /* shift is best-effort; placement below still avoids the old spot */
          }
          placed = modeling.createShape(shape, slot, asFlowNodeContainer(succ.parent ?? root));
        } else if (!explicit && pred && autoPlace) {
          // APPEND after a node: autoPlace finds free space + makes the flow
          // (so we skip the predecessor -> node connect op).
          try {
            placed = autoPlace.append(pred, shape);
            const inc = findIncomingConnect(op.tempId);
            if (inc) consumed.add(inc.op);
            for (const c of placed?.incoming ?? []) changed.add(c.id);
          } catch {
            placed = undefined;
          }
        }

        // Fallback: place inside the right pool/lane, beside a neighbour
        // (never on the collaboration root).
        if (!placed) {
          const parent = asFlowNodeContainer(explicit ?? pred?.parent ?? succ?.parent ?? root);
          placed = modeling.createShape(shape, insertPosition(pred, succ), parent);
        }

        if (op.name) modeling.updateProperties(placed, { name: op.name });
        temp.set(op.tempId, placed);
        changed.add(placed.id);
        return;
      }
      case "connect": {
        if (consumed.has(op)) return; // already created by autoPlace.append
        const from = resolve(op.fromRef);
        const to = resolve(op.toRef);
        if (!from || !to) {
          if (DEBUG)
            console.log("[applyEditPlan] connect unresolved:", op, {
              fromResolved: !!from,
              toResolved: !!to,
            });
          return;
        }
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
