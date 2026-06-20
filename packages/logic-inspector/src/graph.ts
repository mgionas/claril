import type { BpmnNode, ProcessGraph, SequenceFlow } from "./types";

export const isStart = (node: BpmnNode): boolean => node.type === "startEvent";
export const isEnd = (node: BpmnNode): boolean => node.type === "endEvent";
export const isGateway = (node: BpmnNode): boolean => node.type.endsWith("Gateway");
export const isTask = (node: BpmnNode): boolean =>
  node.type === "task" || node.type.endsWith("Task") || node.type === "subProcess";

export function nodeMap(graph: ProcessGraph): Map<string, BpmnNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

export function outgoing(graph: ProcessGraph, nodeId: string): SequenceFlow[] {
  return graph.flows.filter((flow) => flow.sourceRef === nodeId);
}

export function incoming(graph: ProcessGraph, nodeId: string): SequenceFlow[] {
  return graph.flows.filter((flow) => flow.targetRef === nodeId);
}

/** Breadth-first set of node ids reachable from any of `startIds`. */
export function reachableFrom(graph: ProcessGraph, startIds: string[]): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const flow of graph.flows) {
    const targets = adjacency.get(flow.sourceRef) ?? [];
    targets.push(flow.targetRef);
    adjacency.set(flow.sourceRef, targets);
  }

  const seen = new Set<string>();
  const queue = [...startIds];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}
