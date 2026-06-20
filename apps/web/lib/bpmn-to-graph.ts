import type {
  BpmnNode,
  LaneInfo,
  PoolInfo,
  ProcessGraph,
  SequenceFlow,
} from "@claril/logic-inspector";

/** The slice of a bpmn-js diagram element that we read. */
interface DiElement {
  id: string;
  type?: string;
  businessObject?: { name?: string; flowNodeRef?: Array<{ id?: string }> };
  source?: { id: string } | null;
  target?: { id: string } | null;
  parent?: { type?: string; businessObject?: { name?: string } } | null;
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
 *
 * Captures swimlane/pool structure and message flows (not just sequence flows)
 * so downstream grounding can give the AI a faithful picture of the whole
 * diagram — pools, lanes, who-does-what, and cross-pool messaging.
 */
export function bpmnRegistryToGraph(registry: ElementRegistryLike): ProcessGraph {
  const nodes: BpmnNode[] = [];
  const flows: SequenceFlow[] = [];
  const messageFlows: SequenceFlow[] = [];
  const lanes: LaneInfo[] = [];
  const pools: PoolInfo[] = [];

  const all = registry.getAll();

  // First pass: collect pools, lanes (+ their node membership) and message flows.
  const laneByNode = new Map<string, string>(); // nodeId -> lane name
  const poolByNode = new Map<string, string>(); // nodeId -> pool name
  for (const el of all) {
    const type = el.type;
    if (!type) continue;

    if (type === "bpmn:Participant") {
      pools.push({ id: el.id, name: el.businessObject?.name });
      continue;
    }
    if (type === "bpmn:Lane") {
      const name = el.businessObject?.name;
      const nodeIds = (el.businessObject?.flowNodeRef ?? [])
        .map((r) => r?.id)
        .filter((id): id is string => Boolean(id));
      const pool =
        el.parent?.type === "bpmn:Participant" ? el.parent.businessObject?.name : undefined;
      lanes.push({ id: el.id, name, pool, nodeIds });
      for (const id of nodeIds) {
        if (name) laneByNode.set(id, name);
        if (pool) poolByNode.set(id, pool);
      }
      continue;
    }
    if (type === "bpmn:MessageFlow") {
      if (el.source?.id && el.target?.id) {
        messageFlows.push({
          id: el.id,
          sourceRef: el.source.id,
          targetRef: el.target.id,
          name: el.businessObject?.name,
        });
      }
      continue;
    }
  }

  // If there's exactly one pool, every node belongs to it (lanes optional).
  const solePool = pools.length === 1 ? pools[0]?.name : undefined;

  // Second pass: flow nodes and sequence flows.
  for (const el of all) {
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

    if (CONTAINER_TYPES.has(type) || type === "bpmn:MessageFlow") continue;

    // "bpmn:StartEvent" -> "startEvent", "bpmn:ExclusiveGateway" -> "exclusiveGateway"
    const kind = type.slice("bpmn:".length);
    const nodeType = kind.charAt(0).toLowerCase() + kind.slice(1);
    nodes.push({
      id: el.id,
      type: nodeType,
      name: el.businessObject?.name,
      lane: laneByNode.get(el.id),
      pool: poolByNode.get(el.id) ?? solePool,
    });
  }

  const graph: ProcessGraph = { nodes, flows };
  if (lanes.length > 0) graph.lanes = lanes;
  if (pools.length > 0) graph.pools = pools;
  if (messageFlows.length > 0) graph.messageFlows = messageFlows;
  return graph;
}
