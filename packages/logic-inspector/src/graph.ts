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

/**
 * Tarjan's strongly-connected-components, over edges between existing nodes.
 * Used to detect cycles (loops). Each returned component is a list of node ids.
 */
export function stronglyConnectedComponents(graph: ProcessGraph): string[][] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const adjacency = new Map<string, string[]>();
  for (const flow of graph.flows) {
    if (!ids.has(flow.sourceRef) || !ids.has(flow.targetRef)) continue;
    const targets = adjacency.get(flow.sourceRef) ?? [];
    targets.push(flow.targetRef);
    adjacency.set(flow.sourceRef, targets);
  }

  let counter = 0;
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];

  const connect = (v: string): void => {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) ?? []) {
      if (!index.has(w)) {
        connect(w);
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, lowlink.get(w) ?? 0));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, index.get(w) ?? 0));
      }
    }

    if (lowlink.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop() as string;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      result.push(component);
    }
  };

  for (const node of graph.nodes) {
    if (!index.has(node.id)) connect(node.id);
  }
  return result;
}
