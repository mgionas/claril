import type { Finding } from "@claril/shared";
import { isEnd, isStart, outgoing, reachableFrom } from "../graph";
import type { Rule } from "./types";

/** A process must have at least one start event. */
export const missingStartEvent: Rule = {
  id: "structural/missing-start-event",
  run(graph) {
    if (graph.nodes.some(isStart)) return [];
    return [
      {
        ruleId: "structural/missing-start-event",
        severity: "error",
        message: "Process has no start event.",
        quickFix: "Add a start event and connect it to the first activity.",
      },
    ];
  },
};

/** A process must have at least one end event. */
export const missingEndEvent: Rule = {
  id: "structural/missing-end-event",
  run(graph) {
    if (graph.nodes.some(isEnd)) return [];
    return [
      {
        ruleId: "structural/missing-end-event",
        severity: "error",
        message: "Process has no end event.",
        quickFix: "Add an end event so the process can complete.",
      },
    ];
  },
};

/** Every sequence flow must connect two existing nodes. */
export const danglingFlow: Rule = {
  id: "structural/dangling-flow",
  run(graph) {
    const ids = new Set(graph.nodes.map((node) => node.id));
    return graph.flows
      .filter((flow) => !ids.has(flow.sourceRef) || !ids.has(flow.targetRef))
      .map((flow): Finding => {
        const missing = !ids.has(flow.sourceRef) ? flow.sourceRef : flow.targetRef;
        return {
          ruleId: "structural/dangling-flow",
          severity: "error",
          elementId: flow.id,
          message: `Sequence flow "${flow.id}" references a missing node "${missing}".`,
        };
      });
  },
};

/** Every non-start node must be reachable from some start event. */
export const unreachableNode: Rule = {
  id: "structural/unreachable-node",
  run(graph) {
    const startIds = graph.nodes.filter(isStart).map((node) => node.id);
    // If there's no start event at all, `missingStartEvent` already reports it;
    // avoid drowning the user in unreachable-node noise.
    if (startIds.length === 0) return [];

    const reachable = reachableFrom(graph, startIds);
    return graph.nodes
      .filter((node) => !isStart(node) && !reachable.has(node.id))
      .map((node): Finding => ({
        ruleId: "structural/unreachable-node",
        severity: "error",
        elementId: node.id,
        message: `"${node.name ?? node.id}" is unreachable from any start event.`,
      }));
  },
};

/** A non-end node with no outgoing flow is a dead end. */
export const deadEnd: Rule = {
  id: "structural/dead-end",
  run(graph) {
    return graph.nodes
      .filter((node) => !isEnd(node) && outgoing(graph, node.id).length === 0)
      .map((node): Finding => ({
        ruleId: "structural/dead-end",
        severity: "warning",
        elementId: node.id,
        message: `"${node.name ?? node.id}" has no outgoing flow and is not an end event (dead end).`,
        quickFix: "Connect it onward, or convert it to an end event.",
      }));
  },
};
