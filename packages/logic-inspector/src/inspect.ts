import type { Finding } from "@claril/shared";
import { rules as defaultRules } from "./rules";
import type { Rule } from "./rules/types";
import type { ProcessGraph } from "./types";

/**
 * Run the (deterministic) inspector over a process graph. Pass a custom rule
 * set to restrict or extend the analysis. Always returns the same findings for
 * the same input — no AI, no I/O.
 */
export function inspect(graph: ProcessGraph, rules: Rule[] = defaultRules): Finding[] {
  return rules.flatMap((rule) => rule.run(graph));
}
