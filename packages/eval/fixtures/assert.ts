import type { Op } from "@claril/ai-advisor";
import type { AssertContext } from "../src/types";

/**
 * Reusable predicates over an {@link AssertContext}. Each returns a failure
 * message string when the expectation is NOT met, or `null` when satisfied.
 * Compose them with {@link all} to build an `EvalCase["assert"]`.
 */
export type Predicate = (ctx: AssertContext) => string | null;

/** The plan must contain no ops at all (a clean no-op with a summary). */
export const opsEmpty: Predicate = (ctx) =>
  ctx.plan.ops.length === 0 ? null : `expected no ops, got ${ctx.plan.ops.length}`;

/** At least one op of the given discriminated-union kind must be present. */
export const hasOpKind =
  (kind: Op["kind"]): Predicate =>
  (ctx) =>
    ctx.plan.ops.some((o) => o.kind === kind) ? null : `expected an op of kind "${kind}"`;

/** No op of the given kind may be present. */
export const noOpKind =
  (kind: Op["kind"]): Predicate =>
  (ctx) =>
    ctx.plan.ops.some((o) => o.kind === kind) ? `unexpected op of kind "${kind}"` : null;

/** The applied plan must change the node count by exactly `delta`. */
export const nodeCountDelta =
  (delta: number): Predicate =>
  (ctx) => {
    const d = ctx.resultGraph.nodes.length - ctx.baseGraph.nodes.length;
    return d === delta ? null : `expected node count to change by ${delta}, changed by ${d}`;
  };

/** The result graph must contain at least one node of the given type. */
export const hasNodeOfType =
  (type: string): Predicate =>
  (ctx) =>
    ctx.resultGraph.nodes.some((n) => n.type === type)
      ? null
      : `expected a node of type "${type}"`;

/**
 * The plan must not introduce a new pool/participant or lane. `applyPlanToGraph`
 * intentionally drops pool/lane ops (they have no flow-soundness meaning), so we
 * inspect the PLAN ops directly rather than the result graph's `pools` array.
 */
export const noNewPools: Predicate = (ctx) => {
  if (ctx.plan.ops.some((o) => o.kind === "addPool"))
    return "plan introduced a new pool/participant";
  if (ctx.plan.ops.some((o) => o.kind === "addLane")) return "plan introduced a new lane";
  return null;
};

/**
 * No existing node (by id) present in the base graph may be removed by the plan.
 * Splitting a sequence flow when inserting a step is allowed (that deletes a
 * FLOW, not a node), so this compares node ids only.
 */
export const noNodesDeleted: Predicate = (ctx) => {
  const after = new Set(ctx.resultGraph.nodes.map((n) => n.id));
  const removed = ctx.baseGraph.nodes.filter((n) => !after.has(n.id)).map((n) => n.id);
  return removed.length === 0 ? null : `plan removed existing node(s): ${removed.join(", ")}`;
};

/**
 * Compose predicates into an `EvalCase["assert"]` function that returns every
 * failure message (empty array = all satisfied).
 */
export const all =
  (...preds: Predicate[]) =>
  (ctx: AssertContext): string[] =>
    preds.map((p) => p(ctx)).filter((m): m is string => m != null);
