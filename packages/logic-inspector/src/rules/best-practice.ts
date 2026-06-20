import type { Finding } from "@claril/shared";
import { incoming, isStart, isTask, outgoing } from "../graph";
import type { Rule } from "./types";

const DECISION_GATEWAYS = new Set([
  "exclusiveGateway",
  "inclusiveGateway",
  "eventBasedGateway",
]);

/**
 * A task with more than one outgoing flow is an *implicit* split. BPMN best
 * practice is to make the branching explicit with a gateway.
 */
export const implicitGateway: Rule = {
  id: "best-practice/implicit-gateway",
  run(graph) {
    return graph.nodes
      .filter(isTask)
      .filter((node) => outgoing(graph, node.id).length > 1)
      .map((node): Finding => ({
        ruleId: "best-practice/implicit-gateway",
        severity: "warning",
        elementId: node.id,
        message: `"${node.name ?? node.id}" has multiple outgoing flows (implicit split).`,
        quickFix: "Insert an explicit gateway to model the branching decision.",
      }));
  },
};

/** A non-gateway node with multiple incoming flows is an implicit merge. */
export const implicitJoin: Rule = {
  id: "best-practice/implicit-join",
  run(graph) {
    return graph.nodes
      .filter(isTask)
      .filter((node) => incoming(graph, node.id).length > 1)
      .map((node): Finding => ({
        ruleId: "best-practice/implicit-join",
        severity: "warning",
        elementId: node.id,
        message: `"${node.name ?? node.id}" has multiple incoming flows (implicit merge).`,
        quickFix: "Insert an explicit gateway to model the merge.",
      }));
  },
};

/** A splitting decision gateway should be labeled with the question it answers. */
export const unlabeledGateway: Rule = {
  id: "best-practice/unlabeled-gateway",
  run(graph) {
    return graph.nodes
      .filter(
        (node) =>
          DECISION_GATEWAYS.has(node.type) &&
          outgoing(graph, node.id).length > 1 &&
          (node.name === undefined || node.name.trim() === ""),
      )
      .map((node): Finding => ({
        ruleId: "best-practice/unlabeled-gateway",
        severity: "warning",
        elementId: node.id,
        message: `Decision gateway "${node.id}" is unlabeled; name the question it answers.`,
      }));
  },
};

/** Multiple start events make the entry point ambiguous. */
export const multipleStartEvents: Rule = {
  id: "best-practice/multiple-start-events",
  run(graph) {
    const starts = graph.nodes.filter(isStart);
    if (starts.length <= 1) return [];
    return [
      {
        ruleId: "best-practice/multiple-start-events",
        severity: "info",
        message: `Process has ${starts.length} start events; consider a single explicit start.`,
      },
    ];
  },
};
