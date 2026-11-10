import type {
  BpmnNode,
  LaneInfo,
  PoolInfo,
  ProcessGraph,
  SequenceFlow,
} from "@claril/logic-inspector";
// bpmn-moddle ships no type declarations and is consumed across package
// boundaries, so we type its tiny surface locally rather than via an ambient
// module declaration (which would not be visible to dependent packages).
import { BpmnModdle as BpmnModdleUntyped } from "bpmn-moddle";

/** A parsed BPMN moddle element. `$type` carries the BPMN type name. */
export interface ModdleElement {
  $type: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

interface ParseResult {
  rootElement: ModdleElement;
  warnings: unknown[];
}

interface BpmnModdleInstance {
  fromXML(xml: string): Promise<ParseResult>;
}

interface BpmnModdleCtor {
  new (): BpmnModdleInstance;
}

const BpmnModdle = BpmnModdleUntyped as unknown as BpmnModdleCtor;

/**
 * Container / definition element types that hold flow elements but are not
 * themselves nodes in the analysis graph. Mirrors the CONTAINER_TYPES set in
 * `apps/web/lib/bpmn-to-graph.ts` so the headless parser and the browser
 * registry parser produce the same ProcessGraph shape.
 */
const CONTAINER_TYPES = new Set([
  "bpmn:Process",
  "bpmn:Collaboration",
  "bpmn:Definitions",
  "bpmn:Participant",
  "bpmn:Lane",
  "bpmn:LaneSet",
]);

/** moddle elements we recurse into to find flow elements / processes. */
const FLOW_CONTAINER_TYPES = new Set([
  "bpmn:Definitions",
  "bpmn:Process",
  "bpmn:SubProcess",
  "bpmn:AdHocSubProcess",
  "bpmn:Transaction",
]);

/** Result of a parse: the graph plus any non-fatal moddle warnings. */
export interface ParsedBpmn {
  graph: ProcessGraph;
  /** Human-readable moddle warnings (malformed-but-recoverable XML). */
  warnings: string[];
}

/** Thrown when the XML cannot be parsed into a BPMN definitions model. */
export class BpmnParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BpmnParseError";
  }
}

const asArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value === undefined || value === null) return [];
  return [value as T];
};

const refId = (ref: unknown): string | undefined => {
  if (typeof ref === "string") return ref;
  if (ref && typeof ref === "object" && "id" in ref) {
    const id = (ref as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
};

/** "bpmn:StartEvent" -> "startEvent" (matches bpmn-to-graph.ts). */
const toNodeType = (moddleType: string): string => {
  const kind = moddleType.startsWith("bpmn:") ? moddleType.slice("bpmn:".length) : moddleType;
  return kind.charAt(0).toLowerCase() + kind.slice(1);
};

/**
 * Recursively collect nodes and flows from a moddle element tree. SubProcesses
 * are flattened into the same graph (their boundary as a `subProcess` node plus
 * their inner flow elements), matching how the inspector's `isTask` treats
 * subProcess as an activity.
 */
function collect(
  element: ModdleElement,
  nodes: BpmnNode[],
  flows: SequenceFlow[],
  seen: Set<string>,
): void {
  const type = element.$type;
  const flowElements = asArray<ModdleElement>(element.flowElements);

  for (const child of flowElements) {
    const childType = child.$type;
    if (!childType) continue;

    if (childType === "bpmn:SequenceFlow") {
      const id = child.id;
      const sourceRef = refId(child.sourceRef);
      const targetRef = refId(child.targetRef);
      if (id && sourceRef && targetRef) {
        flows.push({ id, sourceRef, targetRef, name: child.name });
      }
      continue;
    }

    // Skip pure containers (lanes etc.) but still descend for flow elements.
    if (!CONTAINER_TYPES.has(childType) && child.id && !seen.has(child.id)) {
      seen.add(child.id);
      nodes.push({ id: child.id, type: toNodeType(childType), name: child.name });
    }

    // Flatten nested flow containers (sub-processes) into the same graph.
    if (FLOW_CONTAINER_TYPES.has(childType) || child.flowElements) {
      collect(child, nodes, flows, seen);
    }
  }

  // Definitions hold rootElements (processes / collaborations), not flowElements.
  if (FLOW_CONTAINER_TYPES.has(type) || type === "bpmn:Definitions") {
    for (const root of asArray<ModdleElement>(element.rootElements)) {
      collect(root, nodes, flows, seen);
    }
  }
}

/** Collect the ids of every flow NODE (not container, not sequence flow) under
 * a process, recursing into sub-processes — used to bind nodes to their pool. */
function collectNodeIds(element: ModdleElement, into: Set<string>): void {
  for (const child of asArray<ModdleElement>(element.flowElements)) {
    const childType = child.$type;
    if (!childType || childType === "bpmn:SequenceFlow") continue;
    if (!CONTAINER_TYPES.has(childType) && child.id) into.add(child.id);
    if (FLOW_CONTAINER_TYPES.has(childType) || child.flowElements) collectNodeIds(child, into);
  }
}

/** Walk a process's laneSets (recursing into nested childLaneSets) and record
 * each lane plus the nodes it names via `flowNodeRef`. */
function collectLanes(
  element: ModdleElement,
  poolName: string | undefined,
  lanes: LaneInfo[],
  laneNameByNode: Map<string, string>,
): void {
  for (const laneSet of asArray<ModdleElement>(element.laneSets)) {
    for (const lane of asArray<ModdleElement>(laneSet.lanes)) {
      if (!lane.id) continue;
      const nodeIds = asArray<unknown>(lane.flowNodeRef)
        .map(refId)
        .filter((id): id is string => typeof id === "string");
      lanes.push({
        id: lane.id,
        ...(lane.name ? { name: lane.name } : {}),
        ...(poolName ? { pool: poolName } : {}),
        nodeIds,
      });
      for (const nodeId of nodeIds) {
        if (lane.name) laneNameByNode.set(nodeId, lane.name);
      }
      // Nested sub-lanes: a Lane may hold a childLaneSet.
      if (lane.childLaneSet) {
        collectLanes({ ...lane, laneSets: [lane.childLaneSet] } as ModdleElement, poolName, lanes, laneNameByNode);
      }
    }
  }
}

/** Collaboration structure: pools (participants), message flows, and the maps
 * needed to bind each flow node to its lane and pool. Empty when the diagram is
 * a single plain process. */
function collectCollaboration(definitions: ModdleElement): {
  pools: PoolInfo[];
  lanes: LaneInfo[];
  messageFlows: SequenceFlow[];
  laneNameByNode: Map<string, string>;
  poolByNode: Map<string, string>;
} {
  const roots = asArray<ModdleElement>(definitions.rootElements);
  const collaboration = roots.find((r) => r.$type === "bpmn:Collaboration");
  const participants = collaboration
    ? asArray<ModdleElement>(collaboration.participants)
    : [];

  const pools: PoolInfo[] = participants
    .filter((p) => p.id)
    .map((p) => ({ id: p.id as string, ...(p.name ? { name: p.name } : {}) }));

  const messageFlows: SequenceFlow[] = collaboration
    ? asArray<ModdleElement>(collaboration.messageFlows).flatMap((mf) => {
        const sourceRef = refId(mf.sourceRef);
        const targetRef = refId(mf.targetRef);
        return mf.id && sourceRef && targetRef
          ? [{ id: mf.id, sourceRef, targetRef, ...(mf.name ? { name: mf.name } : {}) }]
          : [];
      })
    : [];

  // processId -> pool (participant) name.
  const poolNameByProcessId = new Map<string, string>();
  for (const p of participants) {
    const processId = refId(p.processRef);
    if (processId && p.name) poolNameByProcessId.set(processId, p.name);
  }
  const solePool = pools.length === 1 ? pools[0]?.name : undefined;

  const lanes: LaneInfo[] = [];
  const laneNameByNode = new Map<string, string>();
  const poolByNode = new Map<string, string>();
  for (const process of roots.filter((r) => r.$type === "bpmn:Process")) {
    const poolName =
      (process.id ? poolNameByProcessId.get(process.id) : undefined) ?? solePool;
    collectLanes(process, poolName, lanes, laneNameByNode);
    if (poolName) {
      const ids = new Set<string>();
      collectNodeIds(process, ids);
      for (const id of ids) poolByNode.set(id, poolName);
    }
  }

  return { pools, lanes, messageFlows, laneNameByNode, poolByNode };
}

/**
 * Convert a parsed `bpmn:Definitions` moddle root into a ProcessGraph. The
 * graph's `id` is the first process id found (if any). Swimlane/pool structure
 * and message flows are resolved semantically (participants + `flowNodeRef`),
 * mirroring the browser registry parser's shape so AI grounding sees the same
 * POOLS & LANES picture headlessly (CLI / MCP / eval harness).
 */
export function definitionsToGraph(definitions: ModdleElement): ProcessGraph {
  const nodes: BpmnNode[] = [];
  const flows: SequenceFlow[] = [];
  const seen = new Set<string>();

  collect(definitions, nodes, flows, seen);

  const { pools, lanes, messageFlows, laneNameByNode, poolByNode } =
    collectCollaboration(definitions);

  for (const node of nodes) {
    const lane = laneNameByNode.get(node.id);
    const pool = poolByNode.get(node.id);
    if (lane) node.lane = lane;
    if (pool) node.pool = pool;
  }

  const firstProcess = asArray<ModdleElement>(definitions.rootElements).find(
    (root) => root.$type === "bpmn:Process",
  );

  return {
    ...(firstProcess?.id ? { id: firstProcess.id } : {}),
    nodes,
    flows,
    ...(lanes.length > 0 ? { lanes } : {}),
    ...(pools.length > 0 ? { pools } : {}),
    ...(messageFlows.length > 0 ? { messageFlows } : {}),
  };
}

/**
 * Parse raw BPMN 2.0 XML into a ProcessGraph using bpmn-moddle (headless, no
 * browser/DOM). Reusable by the CLI, the MCP server, and any future REST
 * "analysis as a service" surface.
 *
 * @throws {BpmnParseError} when the XML has no `bpmn:Definitions` root.
 */
export async function parseBpmnXml(xml: string): Promise<ParsedBpmn> {
  const moddle = new BpmnModdle();

  let result: ParseResult;
  try {
    result = await moddle.fromXML(xml);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new BpmnParseError(`Failed to parse BPMN XML: ${message}`, { cause });
  }

  const root = result.rootElement;
  if (!root || root.$type !== "bpmn:Definitions") {
    throw new BpmnParseError("BPMN XML did not contain a <bpmn:definitions> root element.");
  }

  const warnings = (result.warnings ?? []).map((w: unknown) =>
    w instanceof Error ? w.message : String((w as { message?: unknown })?.message ?? w),
  );

  return { graph: definitionsToGraph(root), warnings };
}
