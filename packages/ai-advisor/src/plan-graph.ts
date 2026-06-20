import type { ProcessGraph, BpmnNode, SequenceFlow } from "@claril/logic-inspector";
import type { EditPlan } from "./edit-plan";

/**
 * Best-effort simulation of an EditPlan's effect on the process structure
 * (nodes + sequence flows), so the inspector can judge the RESULT's soundness
 * before the user applies it. Ignores ops with no flow-structure meaning
 * (artifacts, lanes/pools, markers, docs, conditions, names). tempIds are used
 * verbatim as the created element's id.
 */
export function applyPlanToGraph(graph: ProcessGraph, plan: EditPlan): ProcessGraph {
  const nodes: BpmnNode[] = graph.nodes.map((n) => ({ ...n }));
  let flows: SequenceFlow[] = (graph.flows ?? []).map((f) => ({ ...f }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  let synth = 0;

  for (const op of plan.ops) {
    switch (op.kind) {
      case "addNode": {
        if (!nodeIds.has(op.tempId)) {
          nodes.push({ id: op.tempId, type: op.type, name: op.name });
          nodeIds.add(op.tempId);
        }
        break;
      }
      case "connect": {
        if (op.flow === "sequence") {
          flows.push({ id: `sim_${synth++}`, sourceRef: op.fromRef, targetRef: op.toRef, name: op.label });
        }
        break;
      }
      case "reconnect": {
        flows = flows.map((f) =>
          f.id === op.flowId
            ? { ...f, sourceRef: op.newSourceRef ?? f.sourceRef, targetRef: op.newTargetRef ?? f.targetRef }
            : f,
        );
        break;
      }
      case "deleteElement": {
        // Remove a flow by id, or a node + its incident flows.
        flows = flows.filter((f) => f.id !== op.elementId);
        if (nodeIds.has(op.elementId)) {
          nodeIds.delete(op.elementId);
          for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].id === op.elementId) nodes.splice(i, 1);
          flows = flows.filter((f) => f.sourceRef !== op.elementId && f.targetRef !== op.elementId);
        }
        break;
      }
      // addPool/addLane/addArtifact/associate/setFlow/setMarker/updateElement/
      // moveToContainer/setDocumentation: no effect on flow soundness.
    }
  }

  return { ...graph, nodes, flows };
}
