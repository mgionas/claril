import {
  applyPlanToGraph,
  validateEditPlan,
  checkPlanScope,
  type EditPlan,
} from "@claril/ai-advisor";
import { inspect, type ProcessGraph } from "@claril/logic-inspector";
import type { Finding } from "@claril/shared";
import type { CaseScore, EvalCase } from "./types";

/** Stable identity for a finding, so we can diff baseline vs. result. */
const key = (f: Finding) => `${f.ruleId}|${f.elementId ?? ""}|${f.message}`;

/**
 * Deterministically score a generated plan against a case. Pure: no LLM, no I/O.
 * Four dimensions, all of which must hold to `pass`:
 *  - validity   — the plan references real ids/tempIds and wires its new nodes
 *  - scope      — the plan doesn't exceed the literal request (no surprise pools…)
 *  - soundness  — applying the plan introduces no NEW error-severity findings
 *  - assertions — the case's own expectations (if any) are all satisfied
 */
export function scoreCase(
  c: EvalCase,
  plan: EditPlan,
  baseGraph: ProcessGraph,
  baselineFindings: Finding[],
): CaseScore {
  const problems: string[] = [];

  const validityErrors = validateEditPlan(plan, baseGraph);
  const validity = validityErrors.length === 0;
  if (!validity) problems.push(`validity: ${validityErrors.join("; ")}`);

  const scopeErrors = checkPlanScope(plan, c.instruction, baseGraph);
  const scope = scopeErrors.length === 0;
  if (!scope) problems.push(`scope: ${scopeErrors.join("; ")}`);

  let resultGraph = baseGraph;
  let applyOk = true;
  try {
    resultGraph = applyPlanToGraph(baseGraph, plan);
  } catch (e) {
    applyOk = false;
    problems.push(`apply: ${e instanceof Error ? e.message : String(e)}`);
  }

  const resultFindings = applyOk ? inspect(resultGraph) : baselineFindings;
  // Only NEW error-severity findings count against soundness; pre-existing
  // errors in the base diagram are the user's, not the plan's.
  const before = new Set(baselineFindings.filter((f) => f.severity === "error").map(key));
  const newErrors = resultFindings.filter((f) => f.severity === "error" && !before.has(key(f)));
  const soundness = applyOk && newErrors.length === 0;
  if (applyOk && newErrors.length > 0) {
    problems.push(
      `soundness: introduced ${newErrors.length} error(s): ${newErrors.map((f) => f.message).join("; ")}`,
    );
  }

  const assertFails = c.assert
    ? c.assert({ plan, baseGraph, resultGraph, baselineFindings, resultFindings })
    : [];
  const assertions = assertFails.length === 0;
  if (!assertions) problems.push(`assert: ${assertFails.join("; ")}`);

  const pass = validity && scope && soundness && assertions;
  return {
    validity,
    scope,
    soundness,
    assertions,
    applyOk,
    pass,
    opCount: plan.ops.length,
    problems,
  };
}
