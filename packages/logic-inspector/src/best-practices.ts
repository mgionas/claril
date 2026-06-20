/**
 * Human-readable authoring guidance that MIRRORS the deterministic inspector
 * rules (structural + best-practice). Fed into the AI generator and editor
 * prompts so AI-authored BPMN avoids the very findings the inspector reports.
 * Keep this in sync with the rules in `rules/structural.ts` + `rules/best-practice.ts`.
 */
export const BPMN_BEST_PRACTICES = `BPMN authoring rules (follow these so the result is sound — Claril's inspector enforces them):
- Exactly one start event; prefer a single start (avoid multiple start events).
- At least one end event, and it must be reachable from the start.
- No dead ends: every non-end node has an outgoing sequence flow.
- No unreachable nodes: every node must be reachable from the start event.
- Every sequence flow has a valid source and target (no dangling flows).
- No infinite loops: any loop must have an exit path toward an end event.
- Model branching/merging with EXPLICIT gateways, never implicitly:
  - A task with MULTIPLE OUTGOING flows is an implicit split — insert an explicit gateway (exclusive for either/or, parallel for concurrent) instead.
  - A task (or node) with MULTIPLE INCOMING flows is an implicit merge — insert an explicit join gateway to merge them.
- Don't mix roles on one gateway: a gateway should either split OR join, not both.
- Label every gateway with the decision it represents, and label each outgoing branch with its condition (e.g. "approved" / "rejected").`;
