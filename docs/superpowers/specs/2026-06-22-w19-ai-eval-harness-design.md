# W19 — AI Editing Eval Harness — Design Spec

**Date:** 2026-06-22
**Status:** Approved (brainstorm) — ready for plan
**Builds on:** W11 (BPMN editing op-set + planner `planEdits`, scope guard `checkPlanScope`, soundness self-repair), the deterministic logic-inspector (`inspect`), `bpmn-parse` (`parseBpmnXml`), `applyPlanToGraph`.
**Goal:** Turn "AI plan quality is not trusted" from a vibe into a **number**. A headless, repeatable harness that runs the AI BPMN-editing pipeline over a fixture set and scores each result with the **existing deterministic validators** as the oracle — so prompt, model, and (later) IR/layout changes become measurable instead of guesswork.

## Why this first
Every other AI-quality idea (semantic IR, deterministic auto-layout, constrained decoding, eventually a fine-tune) needs a way to tell whether it *helped*. The harness is small, has no DB/browser dependency, and is the prerequisite for all of them. It also doubles as the auto-labeller/eval if we ever distil a local model.

## Current state (verified)
Headless primitives already exist and are pure/server-side:
- `parseBpmnXml(xml) → ParsedBpmn` + `definitionsToGraph` (`@claril/bpmn-parse`) — XML → `ProcessGraph`, no browser.
- `inspect(graph, rules?) → Finding[]` (`@claril/logic-inspector`) — the deterministic analyzer (soundness/structural/best-practice).
- `planEditsWithUsage(input, config) → { plan: EditPlan, usage }` (`@claril/ai-advisor`) — the planner (incl. its internal validate + scope + soundness self-repair) with token usage.
- `applyPlanToGraph(graph, plan) → ProcessGraph` — headless application of an `EditPlan`.
- `validateEditPlan(plan, graph) → string[]` and `checkPlanScope(plan, instruction, graph) → string[]` (`@claril/ai-advisor`) — structural-validity + scope-guard checks.
- `LLMProviderConfig` / `createModel` / `DEFAULT_MODELS` for provider config.

So the harness needs **no new model/runtime work** — only orchestration + scoring + fixtures + reporting.

## Design

### 1. Package
A new workspace package **`packages/eval`** (`@claril/eval`), a headless Node/tsx CLI. Deps: `@claril/ai-advisor`, `@claril/logic-inspector`, `@claril/bpmn-parse`, `@claril/shared`. No DB, no Next, no browser. Run via `pnpm --filter @claril/eval eval` (tsx), reading provider creds from env (`--env-file`).

### 2. Fixtures (`packages/eval/fixtures/*.ts`)
Cases are **TypeScript modules** (so assertions are plain functions — no custom DSL):
```ts
export interface EvalCase {
  id: string;
  description: string;
  tags: string[];                 // e.g. ["add","scope","lane","unsupported"]
  baseBpmn: string;               // BPMN 2.0 XML (the starting diagram)
  instruction: string;           // the NL edit request
  /** Per-case expectations over the scored result; return [] when satisfied. */
  assert?: (ctx: AssertContext) => string[];
}
export interface AssertContext {
  plan: EditPlan;
  baseGraph: ProcessGraph;
  resultGraph: ProcessGraph;       // applyPlanToGraph(baseGraph, plan)
  baselineFindings: Finding[];
  resultFindings: Finding[];
}
```
A small **assertion helper library** (`fixtures/assert.ts`) provides reusable predicates over a `ProcessGraph`: `nodeCountDelta`, `hasNodeOfType`, `countOutgoing(id)`, `noNewPools`, `noDeletedNodes`, `opsEmpty`, `hasOpKind`, etc. — used inside `assert`.

**Initial corpus (~10–12 cases)** targeting the known glitch classes (from the roadmap "Known issues"):
- simple add ("add a *Notify customer* step after X") — must NOT invent a pool/message-flow (over-engineering trap).
- "move/group X into the «Support» lane" when the lane exists — must `moveToContainer`, not create a lane.
- insert-into-flow ("add X between A and B") — must delete the A→B flow + rewire.
- conditional branch ("if urgent, escalate") — must insert a gateway with a conditioned + default branch.
- "document/describe X" — must use `setDocumentation`.
- unsupported request ("assign this task to the billing team") — must return `{ ops: [] }` + a one-line summary, not no-op junk.
- delete-only-when-asked — an unrelated edit must not delete existing nodes.
- a couple of larger diagrams for stability.

### 3. Scoring (`src/score.ts`, pure, unit-tested)
`scoreCase(case, plan, baseGraph, baselineFindings) → CaseScore` — deterministic, no LLM:
- **`validity`** — `validateEditPlan(plan, baseGraph).length === 0` (well-formed refs/ops).
- **`scope`** — `checkPlanScope(plan, instruction, baseGraph).length === 0` (no unauthorized pools/deletes/message-flows).
- **`soundness`** — `applyPlanToGraph` → `inspect`; **no NEW error-severity findings** vs `baselineFindings` (pre-existing errors/warnings don't count). Compares by a stable finding key (rule + elementId + message).
- **`assertions`** — `case.assert(ctx) ?? []` is empty.
- **`pass`** — all of the above green.
- Also records `applyOk` (apply didn't throw), `opCount`, and (from the runner) `tokens`.

`CaseScore` carries the failing messages for each dimension so the report is actionable.

### 4. Runner (`src/run.ts`)
For each selected case × `--samples N` (default 1):
1. `parseBpmnXml(baseBpmn)` → `baseGraph`; `inspect(baseGraph)` → `baselineFindings`.
2. `planEditsWithUsage({ graph: baseGraph, findings: baselineFindings, instruction }, config)` → `{ plan, usage }`.
3. `scoreCase(...)`; collect `usage.totalTokens`.
4. On a thrown error (planner/apply), record the case as failed with the error (never crash the run).

LLM output is non-deterministic, so the harness reports a **rate** over the corpus; `--samples` averages out variance, `temperature: 0` reduces it. The *scoring* is fully deterministic.

### 5. Report + CLI
- **Console**: a per-case table (id · pass · validity/scope/soundness/assert · ops · tokens) + an aggregate summary (overall pass rate, per-dimension pass rate, avg/total tokens).
- **JSON**: `eval-report.json` (machine-readable, for trend tracking / CI).
- **Exit code**: non-zero when the overall pass rate is below `--threshold` (default 0 = report-only; CI can raise it later).
- **Flags**: `--case <id>` (filter), `--tag <tag>`, `--samples N`, `--threshold P`, `--provider`/`--model` (else env / `DEFAULT_MODELS`), `--json <path>`.
- **Provider config**: `LLMProviderConfig` from env — `EVAL_PROVIDER`, `EVAL_MODEL`, and the BYOK key (e.g. `EVAL_API_KEY`, or reuse the provider's standard env). Runs with `--env-file` pointing at a local env. No app DB needed.

### 6. Scripts
- `packages/eval/package.json`: `"eval": "tsx src/cli.ts"`, `"eval:ci": "tsx src/cli.ts --threshold 0.8 --json eval-report.json"`.
- Root: a convenience `pnpm eval` passthrough (optional).

## Components & boundaries
- `packages/eval/` — new package; the ONLY new code. No changes to `ai-advisor`/`logic-inspector`/`bpmn-parse` (consume their public exports). If a needed symbol isn't exported, add a minimal export (e.g. confirm `applyPlanToGraph`, `validateEditPlan`, `checkPlanScope`, `planEditsWithUsage`, `inspect`, `parseBpmnXml` are all in the package `index.ts`).
- `src/{cli,run,score,report,types}.ts` + `fixtures/{*.ts, assert.ts, index.ts}`.
- Pure scoring is unit-tested (vitest) with hand-built plans/graphs — **no network in tests**. The live run (with an LLM) is a manual/CI invocation, not a unit test.

## Testing
- **Unit (no LLM):** `scoreCase` and each assertion helper, using fixed `EditPlan` + `ProcessGraph` inputs (validity pass/fail, scope violation detected, new-error detected, assertion pass/fail, applyOk false on a bad plan).
- **Smoke (manual, needs a key):** `pnpm --filter @claril/eval eval --samples 1` against a real provider → a report renders; spot-check a couple of cases.
- Build + typecheck; existing suites stay green.

## Out of scope (v1)
- An LLM-as-judge semantic scorer (intent satisfaction beyond assertions) — a later add; for now `assert` predicates cover intent.
- Record/replay (offline deterministic CI without a key) — a later add; v1 needs a provider key to run live.
- Evaluating chat Q&A, doc-gen, or NL→BPMN generation (`generateBpmnXml`) — the harness is structured to extend to them, but v1 targets the **editing planner** (`planEdits`), the biggest glitch surface.
- Layout/geometry scoring — deferred until the deterministic auto-layout work exists.

## Self-review
- **Placeholders:** none — every primitive is a confirmed existing export; fixtures + scoring + runner are concrete.
- **Consistency:** reuses the exact validators the planner already trusts (`validateEditPlan`/`checkPlanScope`/`inspect`/`applyPlanToGraph`), so the eval's "pass" means the same thing the product means by "sound + in-scope."
- **Scope:** editing planner only; LLM-judge, record/replay, generation/Q&A, and layout scoring explicitly deferred.
- **Ambiguity:** scoring is deterministic; generation isn't — the harness is a measurement tool reporting rates over a corpus, not a pass/fail unit test of the model. Threshold defaults to report-only.
