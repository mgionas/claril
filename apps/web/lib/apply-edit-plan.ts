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
  sendTask: "bpmn:SendTask",
  receiveTask: "bpmn:ReceiveTask",
  scriptTask: "bpmn:ScriptTask",
  businessRuleTask: "bpmn:BusinessRuleTask",
  manualTask: "bpmn:ManualTask",
  callActivity: "bpmn:CallActivity",
  exclusiveGateway: "bpmn:ExclusiveGateway",
  parallelGateway: "bpmn:ParallelGateway",
  inclusiveGateway: "bpmn:InclusiveGateway",
  eventBasedGateway: "bpmn:EventBasedGateway",
  complexGateway: "bpmn:ComplexGateway",
  intermediateThrowEvent: "bpmn:IntermediateThrowEvent",
  intermediateCatchEvent: "bpmn:IntermediateCatchEvent",
  subProcess: "bpmn:SubProcess",
};

const EVENT_DEF: Record<string, string> = {
  timer: "bpmn:TimerEventDefinition",
  message: "bpmn:MessageEventDefinition",
  error: "bpmn:ErrorEventDefinition",
  signal: "bpmn:SignalEventDefinition",
  escalation: "bpmn:EscalationEventDefinition",
  conditional: "bpmn:ConditionalEventDefinition",
  compensation: "bpmn:CompensateEventDefinition",
  terminate: "bpmn:TerminateEventDefinition",
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
  const bpmnFactory = modeler.get("bpmnFactory");
  const bpmnReplace = modeler.get("bpmnReplace");

  const temp = new Map<string, any>(); // tempId -> created element
  const changed = new Set<string>();
  // connect ops already realized via autoPlace.append (skip them in the loop).
  const consumed = new Set<Op>();
  const resolve = (ref: string) => temp.get(ref) ?? elementRegistry.get(ref);

  // Resolve a lane/pool container reference. The planner sometimes passes a
  // lane/pool NAME (e.g. "Back") rather than its element id, so fall back to a
  // case-insensitive name match against the diagram's lanes/participants.
  const resolveContainer = (ref: string): any => {
    const direct = resolve(ref);
    if (direct) return direct;
    const all = (elementRegistry.getAll?.() ?? []) as any[];
    const want = ref.trim().toLowerCase();
    return all.find(
      (e) =>
        (e.type === "bpmn:Lane" || e.type === "bpmn:Participant") &&
        (e.businessObject?.name ?? "").trim().toLowerCase() === want,
    );
  };

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

  const mid = (el: any) => ({ x: el.x + (el.width ?? 0) / 2, y: el.y + (el.height ?? 0) / 2 });

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

  // Set or clear a sequence flow's condition expression.
  const applyCondition = (conn: any, condition?: string) => {
    if (condition === undefined) return;
    const expr = condition
      ? bpmnFactory.create("bpmn:FormalExpression", { body: condition })
      : undefined;
    modeling.updateProperties(conn, { conditionExpression: expr });
  };
  // Mark/unmark a flow as its source gateway's default.
  const applyDefault = (conn: any, isDefault?: boolean) => {
    if (isDefault === undefined || !conn.source) return;
    modeling.updateProperties(conn.source, { default: isDefault ? conn.businessObject : undefined });
  };
  // Set/clear an activity marker (loop / multi-instance / compensation).
  const applyMarker = (el: any, marker: string) => {
    if (marker === "compensation") {
      modeling.updateProperties(el, { isForCompensation: true });
      return;
    }
    if (marker === "none") {
      modeling.updateProperties(el, { loopCharacteristics: undefined, isForCompensation: false });
      return;
    }
    const lc =
      marker === "loop"
        ? bpmnFactory.create("bpmn:StandardLoopCharacteristics")
        : bpmnFactory.create("bpmn:MultiInstanceLoopCharacteristics", {
            isSequential: marker === "multiInstanceSequential",
          });
    modeling.updateProperties(el, { loopCharacteristics: lc });
  };

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
        const pool = resolveContainer(op.poolRef);
        if (!pool) return;
        const lane = modeling.addLane(pool, "bottom");
        if (op.name) modeling.updateProperties(lane, { name: op.name });
        temp.set(op.tempId, lane);
        changed.add(lane.id);
        return;
      }
      case "addNode": {
        const type = BPMN_TYPE[op.type];
        const shape =
          op.type === "subProcess"
            ? elementFactory.createShape({ type, isExpanded: true, width: 350, height: 200 })
            : elementFactory.createShape({ type });
        const explicit = op.containerRef ? resolveContainer(op.containerRef) : null;
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
        if (op.eventDefinition && EVENT_DEF[op.eventDefinition] && /Event$/.test(BPMN_TYPE[op.type] ?? "")) {
          try {
            placed = bpmnReplace.replaceElement(placed, {
              type: BPMN_TYPE[op.type],
              eventDefinitionType: EVENT_DEF[op.eventDefinition],
            });
          } catch {
            /* keep the plain event if replace fails */
          }
        }
        if (op.marker) {
          try { applyMarker(placed, op.marker); } catch { /* best-effort */ }
        }
        temp.set(op.tempId, placed);
        changed.add(placed.id);
        return;
      }
      case "connect": {
        if (consumed.has(op)) return; // already created by autoPlace.append
        const from = resolve(op.fromRef);
        const to = resolve(op.toRef);
        if (!from || !to) return;
        const conn = modeling.connect(from, to);
        if (op.label && conn) modeling.updateProperties(conn, { name: op.label });
        if (conn) {
          applyCondition(conn, op.condition);
          applyDefault(conn, op.isDefault);
        }
        if (conn) changed.add(conn.id);
        return;
      }
      case "setFlow": {
        const conn = resolve(op.flowId);
        if (!conn) return;
        applyCondition(conn, op.condition);
        applyDefault(conn, op.isDefault);
        changed.add(conn.id);
        return;
      }
      case "setMarker": {
        const el = resolve(op.elementId);
        if (!el) return;
        applyMarker(el, op.marker);
        changed.add(el.id);
        return;
      }
      case "moveToContainer": {
        const el = resolve(op.elementId);
        const container = asFlowNodeContainer(resolveContainer(op.containerRef));
        if (!el || !container || typeof el.y !== "number" || typeof container.y !== "number") return;
        // Center the element vertically in the target lane/pool band; bpmn-js
        // LaneBehavior reassigns lane membership from the new position.
        const dy = container.y + (container.height ?? 0) / 2 - (el.y + (el.height ?? 0) / 2);
        modeling.moveElements([el], { x: 0, y: dy }, container);
        changed.add(el.id);
        return;
      }
      case "reconnect": {
        const conn = resolve(op.flowId);
        if (!conn) return;
        if (op.newSourceRef) {
          const ns = resolve(op.newSourceRef);
          if (ns) modeling.reconnectStart(conn, ns, mid(ns));
        }
        if (op.newTargetRef) {
          const nt = resolve(op.newTargetRef);
          if (nt) modeling.reconnectEnd(conn, nt, mid(nt));
        }
        changed.add(conn.id);
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
