# @claril/eval — AI editing eval harness

Headless harness that scores Claril's AI BPMN-editing planner against a fixture
set, using the **deterministic validators as the oracle** — so "AI plan quality"
becomes a measurable number instead of a vibe.

For each fixture (a BPMN diagram + an NL instruction) it runs the real planner
(`planEditsWithUsage`) and scores the result with no human labels:

- **validity** — `validateEditPlan` (well-formed refs/ops)
- **scope** — `checkPlanScope` (no unauthorized pools/deletes/message-flows)
- **soundness** — `applyPlanToGraph` → `inspect`: no NEW error-severity findings vs the baseline
- **assertions** — per-fixture predicates (e.g. "added one node", "used a gateway", "no-op for an unsupported request")
- plus **tokens** used per case

The generator (the LLM) is non-deterministic, so the harness reports **rates
over the corpus**; the scoring itself is fully deterministic. Use it to compare
prompts, models, and (later) the semantic-IR / auto-layout work.

## Run

Needs a BYOK provider key in the environment (the harness calls a real model):

```bash
# OpenRouter (default provider)
EVAL_API_KEY=sk-or-... pnpm --filter @claril/eval eval

# pick a provider/model, run 3 samples per case, fail under 80%
EVAL_PROVIDER=anthropic EVAL_API_KEY=sk-ant-... \
  pnpm --filter @claril/eval eval --model claude-opus-4-8 --samples 3 --threshold 0.8 --json eval-report.json

# a single case / tag
pnpm --filter @claril/eval eval --case add-step-after-task
pnpm --filter @claril/eval eval --tag scope
```

### Env / flags
- `EVAL_PROVIDER` (default `openrouter`), `EVAL_MODEL` (default `DEFAULT_MODELS[provider]`)
- `EVAL_API_KEY` or `<PROVIDER>_API_KEY` (e.g. `OPENROUTER_API_KEY`); `EVAL_BASE_URL` for Ollama/proxy
- `--provider --model --samples --threshold --case --tag --json`
- exit code is non-zero when the overall pass rate `< --threshold` (default `0` = report-only; raise it in CI)

## Add a fixture
Drop a `fixtures/<name>.ts` exporting `EvalCase[]` (small valid BPMN XML +
instruction + an `assert` built from `fixtures/assert.ts` predicates), and add it
to `fixtures/index.ts`. The scoring + assertion helpers are unit-tested
(`pnpm --filter @claril/eval test`) and run without a model.

## Scope (v1)
Targets the **editing planner** (`planEdits`). Not yet: an LLM-as-judge semantic
scorer, record/replay for keyless CI, generation/Q&A evals, or layout/geometry
scoring (deferred until the deterministic auto-layout exists).
