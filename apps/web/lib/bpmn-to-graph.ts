import type { BpmnNode, ProcessGraph, SequenceFlow } from "@claril/logic-inspector";

/** The slice of a bpmn-js diagram element that we read. */
interface DiElement {
  id: string;
  type?: string;
  businessObject?: { name?: string };
  source?: { id: string } | null;
  target?: { id: string } | null;
  labelTarget?: unknown;
}

/** The slice of bpmn-js's elementRegistry we depend on. */
export interface ElementRegistryLike {
  getAll(): DiElement[];
}

const CONTAINER_TYPES = new Set([
  "bpmn:Process",
  "bpmn:Collaboration",
  "bpmn:Definitions",
  "bpmn:Participant",
  "bpmn:Lane",
  "label",
]);

/**
 * Convert a bpmn-js elementRegistry into the framework-free ProcessGraph the
 * logic inspector understands. Keeps bpmn-js out of the analysis engine.
 */
export function bpmnRegistryToGraph(registry: ElementRegistryLike): ProcessGraph {
  const nodes: BpmnNode[] = [];
  const flows: SequenceFlow[] = [];

  for (const el of registry.getAll()) {
    const type = el.type;
    if (!type || !type.startsWith("bpmn:") || el.labelTarget) continue;

    if (type === "bpmn:SequenceFlow") {
      if (el.source?.id && el.target?.id) {
        flows.push({
          id: el.id,
          sourceRef: el.source.id,
          targetRef: el.target.id,
          name: el.businessObject?.name,
        });
      }
      continue;
    }

    if (CONTAINER_TYPES.has(type)) continue;

    // "bpmn:StartEvent" -> "startEvent", "bpmn:ExclusiveGateway" -> "exclusiveGateway"
    const kind = type.slice("bpmn:".length);
    const nodeType = kind.charAt(0).toLowerCase() + kind.slice(1);
    nodes.push({ id: el.id, type: nodeType, name: el.businessObject?.name });
  }

  return { nodes, flows };
}
