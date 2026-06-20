import type {
  ArtifactInfo,
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
  businessObject?: { name?: string; text?: string; flowNodeRef?: Array<{ id?: string }> };
  source?: { id: string } | null;
  target?: { id: string } | null;
  parent?: { type?: string; businessObject?: { name?: string } } | null;
  // Diagram bounds (present on shapes) — used for geometric lane membership.
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labelTarget?: unknown;
}

/** The slice of bpmn-js's elementRegistry we depend on. */
export interface ElementRegistryLike {
  getAll(): DiElement[];
}

const ARTIFACT_KIND: Record<string, "dataObject" | "dataStore" | "textAnnotation"> = {
  "bpmn:DataObjectReference": "dataObject",
  "bpmn:DataStoreReference": "dataStore",
  "bpmn:TextAnnotation": "textAnnotation",
};
const NON_NODE_CONNECTIONS = new Set([
  "bpmn:Association",
  "bpmn:DataInputAssociation",
  "bpmn:DataOutputAssociation",
]);

const CONTAINER_TYPES = new Set([
  "bpmn:Process",
  "bpmn:Collaboration",
  "bpmn:Definitions",
  "bpmn:Participant",
  "bpmn:Lane",
  "label",
]);

interface LaneShape {
  id: string;
  name?: string;
  pool?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
}

const hasBounds = (el: DiElement): boolean =>
  typeof el.x === "number" &&
  typeof el.y === "number" &&
  typeof el.width === "number" &&
  typeof el.height === "number";

/**
 * Convert a bpmn-js elementRegistry into the framework-free ProcessGraph the
 * logic inspector understands. Keeps bpmn-js out of the analysis engine.
 *
 * Captures swimlane/pool structure and message flows (not just sequence flows)
 * so downstream grounding can give the AI a faithful picture of the whole
 * diagram — pools, lanes, who-does-what, and cross-pool messaging.
 *
 * Lane membership is resolved BOTH semantically (`flowNodeRef`) and
 * GEOMETRICALLY (which lane's bounds contain the node) — many diagrams express
 * lane membership only visually, with empty `flowNodeRef`, so geometry is the
 * reliable signal.
 */
export function bpmnRegistryToGraph(registry: ElementRegistryLike): ProcessGraph {
  const nodes: BpmnNode[] = [];
  const flows: SequenceFlow[] = [];
  const messageFlows: SequenceFlow[] = [];
  const pools: PoolInfo[] = [];
  const artifacts: ArtifactInfo[] = [];

  const all = registry.getAll();

  // First pass: pools, lane shapes (with bounds), semantic flowNodeRef map, and
  // message flows.
  const laneShapes: LaneShape[] = [];
  const laneIdByNode = new Map<string, string>(); // nodeId -> lane id (from flowNodeRef)
  for (const el of all) {
    const type = el.type;
    if (!type) continue;

    if (type === "bpmn:Participant") {
      pools.push({ id: el.id, name: el.businessObject?.name });
      continue;
    }
    if (type === "bpmn:Lane") {
      if (hasBounds(el)) {
        laneShapes.push({
          id: el.id,
          name: el.businessObject?.name,
          pool:
            el.parent?.type === "bpmn:Participant" ? el.parent.businessObject?.name : undefined,
          x: el.x!,
          y: el.y!,
          width: el.width!,
          height: el.height!,
          area: el.width! * el.height!,
        });
      }
      for (const r of el.businessObject?.flowNodeRef ?? []) {
        if (r?.id) laneIdByNode.set(r.id, el.id);
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

  // Smallest lane whose bounds contain the element's centre (deepest lane wins
  // for nested lanes). Used when flowNodeRef doesn't name the node.
  const laneByGeometry = (el: DiElement): LaneShape | undefined => {
    if (!hasBounds(el)) return undefined;
    const cx = el.x! + el.width! / 2;
    const cy = el.y! + el.height! / 2;
    let best: LaneShape | undefined;
    for (const L of laneShapes) {
      if (cx >= L.x && cx <= L.x + L.width && cy >= L.y && cy <= L.y + L.height) {
        if (!best || L.area < best.area) best = L;
      }
    }
    return best;
  };

  const laneById = new Map(laneShapes.map((L) => [L.id, L]));
  const solePool = pools.length === 1 ? pools[0]?.name : undefined;
  const laneMembers = new Map<string, string[]>(); // lane id -> node ids

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

    if (ARTIFACT_KIND[type]) {
      artifacts.push({
        id: el.id,
        kind: ARTIFACT_KIND[type],
        name: type === "bpmn:TextAnnotation" ? el.businessObject?.text : el.businessObject?.name,
      });
      continue;
    }
    if (NON_NODE_CONNECTIONS.has(type)) continue;

    // Resolve the node's lane: semantic flowNodeRef first, else geometry.
    const lane = laneById.get(laneIdByNode.get(el.id) ?? "") ?? laneByGeometry(el);
    if (lane) {
      const list = laneMembers.get(lane.id) ?? [];
      list.push(el.id);
      laneMembers.set(lane.id, list);
    }

    // "bpmn:StartEvent" -> "startEvent", "bpmn:ExclusiveGateway" -> "exclusiveGateway"
    const kind = type.slice("bpmn:".length);
    const nodeType = kind.charAt(0).toLowerCase() + kind.slice(1);
    nodes.push({
      id: el.id,
      type: nodeType,
      name: el.businessObject?.name,
      lane: lane?.name,
      pool: lane?.pool ?? solePool,
    });
  }

  const lanes: LaneInfo[] = laneShapes.map((L) => ({
    id: L.id,
    name: L.name,
    pool: L.pool,
    nodeIds: laneMembers.get(L.id) ?? [],
  }));

  const graph: ProcessGraph = { nodes, flows };
  if (lanes.length > 0) graph.lanes = lanes;
  if (pools.length > 0) graph.pools = pools;
  if (messageFlows.length > 0) graph.messageFlows = messageFlows;
  if (artifacts.length > 0) graph.artifacts = artifacts;
  return graph;
}
