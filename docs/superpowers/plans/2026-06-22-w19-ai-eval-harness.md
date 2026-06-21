# W19 — AI Editing Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A headless `@claril/eval` package that runs the AI BPMN-editing planner over a fixture set and scores each result with the existing deterministic validators — so AI plan quality becomes a measurable number.

**Architecture:** Pure scoring (`validateEditPlan` + `checkPlanScope` + `applyPlanToGraph` → `inspect` soundness delta + per-fixture assertions) over fixtures `{baseBpmn, instruction, assert}`. A runner calls `planEditsWithUsage` per case, scores, aggregates, and reports (console + JSON). No DB, no browser.

**Tech stack:** TypeScript, tsx, vitest, `@claril/{ai-advisor,logic-inspector,bpmn-parse,shared}`.

**Spec:** `docs/superpowers/specs/2026-06-22-w19-ai-eval-harness-design.md`

**Conventions:** ESM TS package mirroring the other `packages/*`. Pure functions unit-tested with vitest (no network). The live run needs a BYOK provider key via env. Do NOT read/commit `.env.local`. Stage only the files each task lists.

---

## Task 1: Scaffold the `@claril/eval` package

**Files:**
- Create `packages/eval/package.json`
- Create `packages/eval/tsconfig.json`
- Create `packages/eval/src/types.ts`

- [ ] **Step 1: `package.json`** (mirror another package's shape; main → src for workspace consumption)

```json
{
  "name": "@claril/eval",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "eval": "tsx src/cli.ts",
    "eval:ci": "tsx src/cli.ts --threshold 0.8 --json eval-report.json",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@claril/ai-advisor": "workspace:*",
    "@claril/logic-inspector": "workspace:*",
    "@claril/bpmn-parse": "workspace:*",
    "@claril/shared": "workspace:*"
  },
  "devDependencies": {
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```
(If the repo doesn't use a pnpm `catalog:`, copy the exact versions from `packages/logic-inspector/package.json` devDependencies instead. Match what the sibling packages declare.)

- [ ] **Step 2: `tsconfig.json`** — copy `packages/logic-inspector/tsconfig.json` verbatim (same compiler options / extends the base).

- [ ] **Step 3: `src/types.ts`** — the case + result contracts:

```ts
import type { EditPlan } from "@claril/ai-advisor";
import type { ProcessGraph } from "@claril/logic-inspector";
import type { Finding } from "@claril/shared";

/** Inputs an assertion can inspect about a scored case. */
export interface AssertContext {
  plan: EditPlan;
  baseGraph: ProcessGraph;
  resultGraph: ProcessGraph;
  baselineFindings: Finding[];
  resultFindings: Finding[];
}

export interface EvalCase {
  id: string;
  description: string;
  tags: string[];
  baseBpmn: string;
  instruction: string;
  /** Per-case expectations; return [] when satisfied, else failure messages. */
  assert?: (ctx: AssertContext) => string[];
}

export interface CaseScore {
  validity: boolean;
  scope: boolean;
  soundness: boolean;
  assertions: boolean;
  applyOk: boolean;
  pass: boolean;
  opCount: number;
  /** Human-readable failures per dimension (for the report). */
  problems: string[];
}

export interface CaseResult extends CaseScore {
  id: string;
  tags: string[];
  tokens: number;
  error?: string;
}
```

- [ ] **Step 4: Install + verify the workspace resolves**

Run: `pnpm install` then `pnpm --filter @claril/eval typecheck`
Expected: PASS (types resolve from the sibling packages).

- [ ] **Step 5: Commit**

```bash
git add packages/eval/package.json packages/eval/tsconfig.json packages/eval/src/types.ts pnpm-lock.yaml
git commit -m "feat(eval): scaffold @claril/eval package + core types (W19)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure scoring + unit tests

**Files:**
- Create `packages/eval/src/score.ts`
- Test: `packages/eval/src/score.test.ts`

- [ ] **Step 1: Write the failing tests** (hand-built plan + graph; no LLM)

```ts
import { describe, it, expect } from "vitest";
import type { ProcessGraph } from "@claril/logic-inspector";
import type { EditPlan } from "@claril/ai-advisor";
import { scoreCase } from "./score";
import type { EvalCase } from "./types";

// Minimal sound graph: start -> task -> end.
const graph: ProcessGraph = {
  nodes: [
    { id: "s", type: "startEvent", name: "Start" },
    { id: "t", type: "task", name: "Do" },
    { id: "e", type: "endEvent", name: "End" },
  ],
  flows: [
    { id: "f1", sourceId: "s", targetId: "t" },
    { id: "f2", sourceId: "t", targetId: "e" },
  ],
} as ProcessGraph; // shape per @claril/logic-inspector ProcessGraph

const baseCase = (over: Partial<EvalCase> = {}): EvalCase => ({
  id: "c", description: "", tags: [], baseBpmn: "", instruction: "add a step", ...over,
});

it("passes a valid, in-scope, sound, asserted plan", () => {
  const plan: EditPlan = { summary: "ok", ops: [] };
  const r = scoreCase(baseCase(), plan, graph, []);
  expect(r.validity && r.scope && r.soundness && r.assertions && r.pass).toBe(true);
});

it("fails when an assertion is unmet", () => {
  const plan: EditPlan = { summary: "ok", ops: [] };
  const r = scoreCase(baseCase({ assert: () => ["expected a new gateway"] }), plan, graph, []);
  expect(r.assertions).toBe(false);
  expect(r.pass).toBe(false);
  expect(r.problems.join(" ")).toContain("gateway");
});
```
(Adjust the `ProcessGraph`/`EditPlan` literals to the EXACT shapes exported by the packages — open `@claril/logic-inspector` types and `@claril/ai-advisor` `EditPlanSchema` to match field names like `nodes`/`flows`/`sourceId`.)

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @claril/eval test` → FAIL (no `scoreCase`).

- [ ] **Step 3: Implement `src/score.ts`**

```ts
import { applyPlanToGraph, validateEditPlan, checkPlanScope, type EditPlan } from "@claril/ai-advisor";
import { inspect, type ProcessGraph } from "@claril/logic-inspector";
import type { Finding } from "@claril/shared";
import type { CaseScore, EvalCase } from "./types";

const key = (f: Finding) => `${f.ruleId}|${f.elementId ?? ""}|${f.message}`;

/** Deterministically score a generated plan against a case. No LLM, no I/O. */
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
  // New ERROR-severity findings introduced by the plan (pre-existing don't count).
  const before = new Set(baselineFindings.filter((f) => f.severity === "error").map(key));
  const newErrors = resultFindings.filter((f) => f.severity === "error" && !before.has(key(f)));
  const soundness = applyOk && newErrors.length === 0;
  if (applyOk && newErrors.length > 0) {
    problems.push(`soundness: introduced ${newErrors.length} error(s): ${newErrors.map((f) => f.message).join("; ")}`);
  }

  const assertFails = c.assert
    ? c.assert({ plan, baseGraph, resultGraph, baselineFindings, resultFindings })
    : [];
  const assertions = assertFails.length === 0;
  if (!assertions) problems.push(`assert: ${assertFails.join("; ")}`);

  const pass = validity && scope && soundness && assertions;
  return {
    validity, scope, soundness, assertions, applyOk, pass,
    opCount: plan.ops.length, problems,
  };
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @claril/eval test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/eval/src/score.ts packages/eval/src/score.test.ts
git commit -m "feat(eval): deterministic scoreCase (validity/scope/soundness/assert) + tests (W19)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Assertion helpers + fixture corpus

**Files:**
- Create `packages/eval/fixtures/assert.ts`
- Create `packages/eval/fixtures/index.ts`
- Create `packages/eval/fixtures/*.ts` (the cases)

- [ ] **Step 1: `fixtures/assert.ts`** — reusable predicates over `AssertContext` (each returns a failure string or null):

```ts
import type { AssertContext } from "../src/types";
import type { Op } from "@claril/ai-advisor";

export const opsEmpty = (ctx: AssertContext) =>
  ctx.plan.ops.length === 0 ? null : `expected no ops, got ${ctx.plan.ops.length}`;

export const hasOpKind = (kind: Op["kind"]) => (ctx: AssertContext) =>
  ctx.plan.ops.some((o) => o.kind === kind) ? null : `expected an op of kind "${kind}"`;

export const noOpKind = (kind: Op["kind"]) => (ctx: AssertContext) =>
  ctx.plan.ops.some((o) => o.kind === kind) ? `unexpected op of kind "${kind}"` : null;

export const nodeCountDelta = (delta: number) => (ctx: AssertContext) => {
  const d = ctx.resultGraph.nodes.length - ctx.baseGraph.nodes.length;
  return d === delta ? null : `expected node count to change by ${delta}, changed by ${d}`;
};

export const hasNodeOfType = (type: string) => (ctx: AssertContext) =>
  ctx.resultGraph.nodes.some((n) => n.type === type) ? null : `expected a node of type "${type}"`;

export const noNewPools = (ctx: AssertContext) => {
  const pool = (g: AssertContext["baseGraph"]) => g.nodes.filter((n) => n.type === "participant" || n.type === "pool").length;
  return pool(ctx.resultGraph) > pool(ctx.baseGraph) ? "plan introduced a new pool/participant" : null;
};

/** Compose predicates into an `assert` function returning all failures. */
export const all =
  (...preds: Array<(ctx: AssertContext) => string | null>) =>
  (ctx: AssertContext): string[] =>
    preds.map((p) => p(ctx)).filter((m): m is string => m != null);
```
(Match `Op["kind"]` and node-type strings to the real unions in `@claril/ai-advisor` `edit-plan.ts` `NODE_TYPES`/`OpSchema` and the inspector's node types. Adjust `participant`/`pool` to the actual type name used.)

- [ ] **Step 2: Author the cases** — one file per theme (or grouped), each exporting `EvalCase[]`. Provide a small valid BPMN XML per case (a 3–6 element process). Cover the spec's corpus:
  - `add-step.ts` — "add a *Notify customer* step after «Task»" → `all(hasOpKind("addNode"), hasOpKind("connect"), noNewPools, nodeCountDelta(1))`.
  - `move-to-lane.ts` — base has a "Support" lane; "move «Task» into the Support lane" → `all(hasOpKind("moveToContainer"), noNewPools, nodeCountDelta(0))`.
  - `insert-into-flow.ts` — "add «Review» between A and B" → `all(hasOpKind("addNode"), hasOpKind("deleteElement") /* the split flow */, nodeCountDelta(1))`.
  - `conditional-branch.ts` — "if urgent, escalate" → `all(hasNodeOfType("exclusiveGateway"))`.
  - `document.ts` — "document the «Approve» task" → `hasOpKind("setDocumentation")` (no node delta).
  - `unsupported.ts` — "assign this task to the billing team" → `opsEmpty` (must no-op with a summary).
  - `no-unrequested-delete.ts` — an additive instruction → `noOpKind("deleteElement")` unless it's a flow split; assert `nodeCountDelta(1)` and no node deletions.
  Use real, valid BPMN XML (you can hand-write minimal `bpmn:definitions` or capture one from the app). Keep each diagram small.

- [ ] **Step 3: `fixtures/index.ts`** — aggregate:

```ts
import type { EvalCase } from "../src/types";
import { addStepCases } from "./add-step";
// ...import the rest
export const cases: EvalCase[] = [...addStepCases, /* ... */];
```

- [ ] **Step 4: Typecheck** — `pnpm --filter @claril/eval typecheck` → PASS (fixtures conform to `EvalCase`).

- [ ] **Step 5: Commit**

```bash
git add packages/eval/fixtures
git commit -m "feat(eval): assertion helpers + fixture corpus for the editing glitch classes (W19)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Runner + report + CLI

**Files:**
- Create `packages/eval/src/run.ts`
- Create `packages/eval/src/report.ts`
- Create `packages/eval/src/cli.ts`
- Create `packages/eval/src/index.ts` (re-exports `scoreCase`, `run`, types)

- [ ] **Step 1: `src/run.ts`** — execute one case (LLM call + score), and the corpus:

```ts
import { parseBpmnXml } from "@claril/bpmn-parse";
import { inspect } from "@claril/logic-inspector";
import { planEditsWithUsage, type LLMProviderConfig } from "@claril/ai-advisor";
import { scoreCase } from "./score";
import type { CaseResult, EvalCase } from "./types";

export async function runCase(c: EvalCase, config: LLMProviderConfig): Promise<CaseResult> {
  try {
    const parsed = await parseBpmnXml(c.baseBpmn);
    const baseGraph = parsed.graph; // confirm the field name from ParsedBpmn
    const baselineFindings = inspect(baseGraph);
    const { plan, usage } = await planEditsWithUsage(
      { graph: baseGraph, findings: baselineFindings, instruction: c.instruction },
      config,
    );
    const score = scoreCase(c, plan, baseGraph, baselineFindings);
    return { id: c.id, tags: c.tags, tokens: usage?.totalTokens ?? 0, ...score };
  } catch (e) {
    return {
      id: c.id, tags: c.tags, tokens: 0,
      validity: false, scope: false, soundness: false, assertions: false,
      applyOk: false, pass: false, opCount: 0,
      problems: [], error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function run(
  cases: EvalCase[], config: LLMProviderConfig, samples = 1,
): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (const c of cases) {
    for (let i = 0; i < samples; i++) out.push(await runCase(c, config));
  }
  return out;
}
```
(Confirm `parseBpmnXml`'s return field for the graph — it returns `ParsedBpmn`; use `definitionsToGraph` if `parseBpmnXml` doesn't directly expose `.graph`. Confirm `LLMProviderConfig` export + `usage.totalTokens` field.)

- [ ] **Step 2: `src/report.ts`** — aggregate + render:

```ts
import type { CaseResult } from "./types";

export interface Report {
  total: number; passed: number; passRate: number;
  byDimension: Record<"validity" | "scope" | "soundness" | "assertions", number>;
  avgTokens: number; totalTokens: number; results: CaseResult[];
}

export function aggregate(results: CaseResult[]): Report {
  const total = results.length || 1;
  const rate = (k: keyof CaseResult) => results.filter((r) => r[k] === true).length / total;
  const totalTokens = results.reduce((n, r) => n + r.tokens, 0);
  return {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    passRate: results.filter((r) => r.pass).length / total,
    byDimension: {
      validity: rate("validity"), scope: rate("scope"),
      soundness: rate("soundness"), assertions: rate("assertions"),
    },
    avgTokens: Math.round(totalTokens / total), totalTokens, results,
  };
}

export function renderConsole(r: Report): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const rows = r.results
    .map((c) => `  ${c.pass ? "✓" : "✗"} ${c.id.padEnd(22)} ops:${String(c.opCount).padStart(2)} tok:${String(c.tokens).padStart(5)}${c.error ? `  ERR ${c.error}` : c.problems.length ? `  ${c.problems.join(" | ")}` : ""}`)
    .join("\n");
  return [
    rows, "",
    `Pass ${r.passed}/${r.total} (${pct(r.passRate)})  |  validity ${pct(r.byDimension.validity)}  scope ${pct(r.byDimension.scope)}  soundness ${pct(r.byDimension.soundness)}  assert ${pct(r.byDimension.assertions)}`,
    `Tokens: ${r.totalTokens} total, ${r.avgTokens} avg/case`,
  ].join("\n");
}
```

- [ ] **Step 3: `src/cli.ts`** — flags, provider config from env, run, print, exit code:

```ts
import { writeFileSync } from "node:fs";
import { DEFAULT_MODELS, type AiProvider, type LLMProviderConfig } from "@claril/ai-advisor";
import { cases as allCases } from "../fixtures/index";
import { run } from "./run";
import { aggregate, renderConsole } from "./report";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const provider = (arg("provider") ?? process.env.EVAL_PROVIDER ?? "openrouter") as AiProvider;
const model = arg("model") ?? process.env.EVAL_MODEL ?? DEFAULT_MODELS[provider];
const apiKey = process.env.EVAL_API_KEY ?? process.env[`${provider.toUpperCase()}_API_KEY`];
const samples = Number(arg("samples") ?? 1);
const threshold = Number(arg("threshold") ?? 0);
const only = arg("case");
const tag = arg("tag");

const config: LLMProviderConfig = { provider, model, apiKey };

const selected = allCases
  .filter((c) => (only ? c.id === only : true))
  .filter((c) => (tag ? c.tags.includes(tag) : true));

const results = await run(selected, config, samples);
const report = aggregate(results);
console.log(renderConsole(report));
const jsonPath = arg("json");
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 2));
if (report.passRate < threshold) process.exit(1);
```
(Confirm `LLMProviderConfig` field names — `apiKey`/`baseUrl` — against the type. Allow `baseUrl` via `EVAL_BASE_URL` for Ollama/OpenRouter if needed.)

- [ ] **Step 4: `src/index.ts`** — `export { scoreCase } from "./score"; export { run, runCase } from "./run"; export { aggregate, renderConsole } from "./report"; export * from "./types";`

- [ ] **Step 5: Typecheck + a dry unit pass**

Run: `pnpm --filter @claril/eval typecheck` → PASS. `pnpm --filter @claril/eval test` → PASS (scoring tests still green; the CLI/runner aren't unit-tested since they need an LLM).

- [ ] **Step 6: Commit**

```bash
git add packages/eval/src/run.ts packages/eval/src/report.ts packages/eval/src/cli.ts packages/eval/src/index.ts
git commit -m "feat(eval): runner + aggregate report + CLI (flags, env provider, threshold) (W19)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verify + README + live smoke

**Files:**
- Create `packages/eval/README.md`
- (no code)

- [ ] **Step 1: Full verification** — `pnpm --filter @claril/eval typecheck && pnpm --filter @claril/eval test` → PASS. `pnpm -w typecheck` (or build the web app) stays green (the new package doesn't break the workspace).

- [ ] **Step 2: `README.md`** — how to run: env vars (`EVAL_PROVIDER`, `EVAL_MODEL`, `EVAL_API_KEY`/`EVAL_BASE_URL`), `pnpm --filter @claril/eval eval --samples 1`, the flags, and how to read the report. Note it needs a BYOK key and that scores are rates over a non-deterministic generator.

- [ ] **Step 3: Live smoke (manual, needs a key)** — run `EVAL_PROVIDER=openrouter EVAL_API_KEY=… pnpm --filter @claril/eval eval` once; confirm a report renders and spot-check that at least the deterministic dimensions score sensibly. (If no key is available in the environment, document the exact command for the user to run and skip.)

- [ ] **Step 4: Commit + finish**

```bash
git add packages/eval/README.md
git commit -m "docs(eval): README for the AI editing eval harness (W19)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Then add a W19 row to `docs/roadmap.md` (eval harness — built) and use `superpowers:finishing-a-development-branch` (await the user's merge/push go-ahead).

---

## Self-review
- **Spec coverage:** package scaffold (T1), pure scoring with the deterministic oracle (T2), assertion helpers + corpus targeting the glitch classes (T3), runner/report/CLI (T4), verify + README + live smoke (T5). Covers spec §§1–6.
- **Placeholders:** none — concrete code per step. The only "confirm the exact field name" notes are because the plan must match the live exports of sibling packages (`ProcessGraph` fields, `Op["kind"]` union, `parseBpmnXml` return, `LLMProviderConfig` fields); the implementer verifies each against the real type while wiring.
- **Type consistency:** `EvalCase`/`AssertContext`/`CaseScore`/`CaseResult` defined in T1 and consumed by T2–T4; `scoreCase` (T2) used by `runCase` (T4); fixtures (T3) typed as `EvalCase`.
- **No network in tests:** only the CLI/live-smoke calls an LLM; `scoreCase` + assertion helpers are pure and unit-tested.
