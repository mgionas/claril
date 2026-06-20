# BPMN Editing Capabilities — Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Make AI edits *trustworthy* — stop over-scoped plans (new pools / deletes / message flows the user didn't ask for) and broken topologies before they reach the user, and lay out applied edits cleanly.

**The problem (observed):** prompts + structural validation aren't enough — the planner still over-engineers ("notify the back office" → new pool + message flow + delete tasks). Phase 5 adds **deterministic guards** that feed the existing self-repair retry, plus a layout pass.

**Three slices (build in order; each shippable):**
1. **Scope guard** — cross-check the plan's heavy ops vs the user's instruction keywords; reject (→ retry) over-scoped plans. *Directly targets the over-engineering pain.*
2. **Soundness validation** — simulate the plan on the `ProcessGraph` and run the inspector; reject plans that introduce new structural errors (deadlocks, disconnected, implicit split).
3. **Pool-safe auto-layout** — after an applied AI edit, reflow cleanly (single-process via `bpmn-auto-layout`; pooled diagrams keep the localized make-space).

**Spec:** `docs/superpowers/specs/2026-06-21-bpmn-editing-capabilities.md` (Phase 5).

---

### Task 1: Scope guard (over-engineering)

**Files:** `packages/ai-advisor/src/edit-plan.ts`, `packages/ai-advisor/src/edit-plan.test.ts`, `packages/ai-advisor/src/planner.ts`

- [ ] **Step 1: `checkPlanScope` in edit-plan.ts**

A pure function that flags ops the user's instruction didn't authorize:
```tsx
/**
 * Flag plans that exceed the literal request — the over-engineering class the
 * planner drifts into (inventing pools / message flows / deleting elements for
 * a simple add/move). Keyword-driven against the instruction; feeds the
 * self-repair retry. Returns human-readable violations (empty = in scope).
 */
export function checkPlanScope(plan: EditPlan, instruction: string, graph: ProcessGraph): string[] {
  const txt = instruction.toLowerCase();
  const has = (...words: string[]) => words.some((w) => txt.includes(w));
  const out: string[] = [];

  if (plan.ops.some((o) => o.kind === "addPool") && !has("pool", "participant", "separate process", "external")) {
    out.push("Creates a new POOL/participant the request didn't ask for — keep everything in the existing process; do not split into pools.");
  }
  if (plan.ops.some((o) => o.kind === "addLane") && !has("lane", "swimlane", "pool", "role", "actor", "department")) {
    out.push("Creates a new LANE the request didn't ask for.");
  }
  if (plan.ops.some((o) => o.kind === "connect" && o.flow === "message") && !has("message", "pool", "participant")) {
    out.push("Adds a MESSAGE FLOW the request didn't ask for — use a normal task/sequence flow inside the process.");
  }
  const flowIds = new Set((graph.flows ?? []).map((f) => f.id));
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const deletesNode = plan.ops.some(
    (o) => o.kind === "deleteElement" && nodeIds.has(o.elementId) && !flowIds.has(o.elementId),
  );
  if (deletesNode && !has("delete", "remove", "replace", "drop", "get rid", "clean up")) {
    out.push("Deletes existing element(s) the request didn't ask to remove — only the single sequence flow you split when inserting may be deleted.");
  }
  return out;
}
```

- [ ] **Step 2: Tests** (edit-plan.test.ts) — over-scoped plan against a benign instruction flags; the same plan with an explicit instruction (e.g. "split into a separate pool") does not; a delete-node without "delete" in the instruction flags; deleting a *flow* (insert-rewire) never flags.

- [ ] **Step 3: Wire into the self-repair retry** (planner.ts `planEditsWithUsage`)

Combine scope violations with the existing `validateEditPlan` errors so a single retry fixes both:
```tsx
  const problems = [
    ...validateEditPlan(plan, input.graph),
    ...checkPlanScope(plan, input.instruction, input.graph),
  ];
  if (problems.length > 0) {
    // ...existing repair prompt, but list `problems` (not just validation errors)...
  }
```
(Update the repair-prompt wording to: "Stay within the literal request: do not create pools/lanes/message flows or delete elements the user didn't ask for; connect every added node; only reference real ids/tempIds.")

- [ ] **Step 4: Verify + commit** (`pnpm --filter @claril/ai-advisor typecheck` · `exec vitest run` · `pnpm --filter web typecheck` · `pnpm --filter web build`).
```bash
git commit -m "feat(ai): scope guard — reject over-engineered plans (new pools/deletes not requested) …"
```

---

### Task 2: Soundness validation (resulting-graph inspection)

**Files:** `packages/ai-advisor/src/plan-graph.ts` (new) + test, `packages/ai-advisor/src/planner.ts`, export from `index.ts`

- [ ] **Step 1: `applyPlanToGraph(graph, plan): ProcessGraph`** — a pure, best-effort simulation of a plan's effect on the `ProcessGraph` (add nodes/artifacts, add/remove flows, delete elements, reconnect, move-lane). Enough fidelity to run structural rules on the result; ignore ops with no graph-level meaning (markers, docs, conditions).

- [ ] **Step 2: Wire into the retry** — after scope+validation pass, run `inspect(applyPlanToGraph(graph, plan))`; compute **new** errors not present in the original `findings`; if any, add them to the repair feedback ("your change introduces: deadlock at X / Y is unreachable"). One retry total (shared budget with Task 1 — don't stack retries).

- [ ] **Step 3: Tests** — a plan that leaves a node unreachable/disconnected yields a new error; a clean insert yields none.

- [ ] **Step 4: Verify + commit.**

---

### Task 3: Pool-safe auto-layout

**Files:** `apps/web/lib/apply-edit-plan.ts` (or a post-apply hook in `bpmn-workbench.tsx`)

- [ ] **Step 1:** After an applied AI edit, if the diagram is a **single process** (no `bpmn:Collaboration`/multiple participants), run a layout pass (`bpmn-auto-layout` over the exported XML → reimport, preserving ids so AI-edit marks/diff still resolve). For **pooled** diagrams, keep the current localized make-space (bpmn-auto-layout can't handle pools).
- [ ] **Step 2:** Gate it so it only runs for AI applies (not every edit), and is best-effort (never throws into the UI).
- [ ] **Step 3:** Manual verify: insert/move on a single-process diagram reflows cleanly; pooled diagram still uses make-space (no mangling).

> Task 3 is runtime-only verifiable and the riskiest; ship Tasks 1–2 first, then evaluate whether full relayout is worth it vs. the make-space we have.

---

### Task 4: Manual verification

- [ ] Restart `pnpm dev`. Re-run the cases that failed before:
  - *"notify the back office after payment"* → a single task in the existing process, **no pool, no message flow, no deletes**.
  - *"rearrange the back tasks into the Back lane"* → `moveToContainer` only.
  - A request that *would* break the process (e.g. "delete the start event") → the assistant warns/declines or the soundness check forces a sound result.

---

## Self-Review
- Scope guard is keyword-heuristic (instruction-driven) — deterministic, testable, feeds the existing one-shot retry; the dominant lever for the observed over-engineering.
- Soundness validation reuses the inspector on a simulated result — catches broken topology the schema/scope checks can't.
- Auto-layout stays pool-safe (single-process only) — bpmn-auto-layout is single-process; pooled diagrams keep make-space.
- All guards funnel into ONE self-repair retry (bounded cost). Pure functions are unit-tested; apply/layout are runtime-verified.

## Out of scope
- Multi-retry loops (cost); a fully general lane-aware layout engine (big — revisit only if make-space + single-process relayout prove insufficient).
