/**
 * A framework-free process graph. The inspector analyzes THIS, not bpmn-js
 * directly — `@claril/core-bpmn` converts a bpmn-js model into a ProcessGraph,
 * which keeps the inspector pure, deterministic, and trivially testable.
 */

export type BpmnNodeType =
  | "startEvent"
  | "endEvent"
  | "intermediateEvent"
  | "task"
  | "userTask"
  | "serviceTask"
  | "scriptTask"
  | "manualTask"
  | "businessRuleTask"
  | "exclusiveGateway"
  | "parallelGateway"
  | "inclusiveGateway"
  | "eventBasedGateway"
  | "subProcess"
  // Allow forward-compatibility with element types we don't model yet.
  | (string & {});

export interface BpmnNode {
  id: string;
  type: BpmnNodeType;
  name?: string;
  /** Name of the lane the node sits in, when the diagram uses swimlanes. */
  lane?: string;
  /** Name of the pool/participant the node belongs to, when present. */
  pool?: string;
}

export interface SequenceFlow {
  id: string;
  sourceRef: string;
  targetRef: string;
  name?: string;
}

/** A swimlane (and the pool it belongs to) with the nodes it contains. */
export interface LaneInfo {
  id: string;
  name?: string;
  pool?: string;
  nodeIds: string[];
}

/** A pool / participant in a collaboration. */
export interface PoolInfo {
  id: string;
  name?: string;
}

/** A non-flow element: data object/store or text annotation. */
export interface ArtifactInfo {
  id: string;
  kind: "dataObject" | "dataStore" | "textAnnotation";
  name?: string;
}

export interface ProcessGraph {
  id?: string;
  nodes: BpmnNode[];
  flows: SequenceFlow[];
  /** Swimlanes, when the diagram has them (optional; analysis ignores them). */
  lanes?: LaneInfo[];
  /** Pools / participants, when the diagram is a collaboration. */
  pools?: PoolInfo[];
  /** Message flows between pools (distinct from sequence flows). */
  messageFlows?: SequenceFlow[];
  /** Non-flow elements: data objects/stores and text annotations. */
  artifacts?: ArtifactInfo[];
}
