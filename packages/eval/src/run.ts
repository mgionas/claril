import { parseBpmnXml } from "@claril/bpmn-parse";
import { inspect } from "@claril/logic-inspector";
import { planEditsWithUsage, type LLMProviderConfig } from "@claril/ai-advisor";
import { scoreCase } from "./score";
import type { CaseResult, EvalCase } from "./types";

/**
 * Run one eval case end-to-end: parse the base BPMN, inspect for baseline
 * findings, ask the planner for an edit plan (the only network call), then
 * score it deterministically. Any throw (parse error, provider error, malformed
 * plan) becomes a failed CaseResult carrying the message — the harness never
 * crashes mid-corpus.
 */
export async function runCase(c: EvalCase, config: LLMProviderConfig): Promise<CaseResult> {
  try {
    const { graph: baseGraph } = await parseBpmnXml(c.baseBpmn);
    const baselineFindings = inspect(baseGraph);
    const { plan, usage } = await planEditsWithUsage(
      { graph: baseGraph, findings: baselineFindings, instruction: c.instruction },
      config,
    );
    const score = scoreCase(c, plan, baseGraph, baselineFindings);
    const tokens =
      usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    return { id: c.id, tags: c.tags, tokens, ...score };
  } catch (e) {
    return {
      id: c.id,
      tags: c.tags,
      tokens: 0,
      validity: false,
      scope: false,
      soundness: false,
      assertions: false,
      applyOk: false,
      pass: false,
      opCount: 0,
      problems: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Run the whole corpus, `samples` times per case. Sequential on purpose: a
 * non-deterministic generator benefits from repeated samples, but firing them
 * all at once would hammer the BYOK provider's rate limits.
 */
export async function run(
  cases: EvalCase[],
  config: LLMProviderConfig,
  samples = 1,
): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (const c of cases) {
    for (let i = 0; i < samples; i++) {
      out.push(await runCase(c, config));
    }
  }
  return out;
}
