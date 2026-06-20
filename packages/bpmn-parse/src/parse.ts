import type { BpmnNode, ProcessGraph, SequenceFlow } from "@claril/logic-inspector";
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

/**
 * Convert a parsed `bpmn:Definitions` moddle root into a ProcessGraph. The
 * graph's `id` is the first process id found (if any).
 */
export function definitionsToGraph(definitions: ModdleElement): ProcessGraph {
  const nodes: BpmnNode[] = [];
  const flows: SequenceFlow[] = [];
  const seen = new Set<string>();

  collect(definitions, nodes, flows, seen);

  const firstProcess = asArray<ModdleElement>(definitions.rootElements).find(
    (root) => root.$type === "bpmn:Process",
  );

  return {
    ...(firstProcess?.id ? { id: firstProcess.id } : {}),
    nodes,
    flows,
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
