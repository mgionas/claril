import type { Finding } from "@claril/shared";
import { isTask, outgoing } from "../graph";
import type { Rule } from "./types";

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
