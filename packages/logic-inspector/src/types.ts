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
}

export interface SequenceFlow {
  id: string;
  sourceRef: string;
  targetRef: string;
  name?: string;
}

export interface ProcessGraph {
  id?: string;
  nodes: BpmnNode[];
  flows: SequenceFlow[];
}
