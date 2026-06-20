import { generateObject, type LanguageModelUsage } from "ai";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import { BPMN_BEST_PRACTICES } from "@claril/logic-inspector";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";
import type { AssetContext } from "./grounding";
import { describeGrounding } from "./advisor";
import { EditPlanSchema, type EditPlan } from "./edit-plan";

export interface PlanEditsInput {
  graph: ProcessGraph;
  findings: Finding[];
  assetContext?: AssetContext;
  /** The user's natural-language editing instruction. */
  instruction: string;
}

const PLANNER_SYSTEM_PROMPT = `You are Claril's BPMN editing planner. Given the current process model and a user instruction, produce a MINIMAL, VALID plan of edit operations — never prose, never XML, never coordinates.

Rules:
- Reference EXISTING elements by their exact id (shown in CURRENT MODEL). Reference elements you create earlier in the same plan by their tempId.
- Use flow:"sequence" for connections inside one process/pool; use flow:"message" for connections BETWEEN different pools (participants).
- Put a node inside a pool/lane with containerRef (a pool/lane tempId or an existing element id) when the instruction implies swimlanes.
- Prefer the smallest set of ops that satisfies the instruction. Do not restructure unrelated parts of the model.
- When your change would create an implicit split (a node with multiple outgoing flows) or an implicit merge (a node with multiple incoming flows), insert an explicit gateway instead — never wire multiple flows straight into/out of a task.
- "summary" is a one-line human description of the change.

${BPMN_BEST_PRACTICES}`;

/** Pure: assemble the user-facing prompt (grounding + instruction). Testable. */
export function buildPlannerPrompt(input: PlanEditsInput): string {
  const grounding = describeGrounding({
    graph: input.graph,
    findings: input.findings,
    assetContext: input.assetContext,
  });
  return `CURRENT MODEL:\n${grounding}\n\nINSTRUCTION:\n${input.instruction}`;
}

export async function planEditsWithUsage(
  input: PlanEditsInput,
  config: LLMProviderConfig,
): Promise<{ plan: EditPlan; usage: LanguageModelUsage }> {
  const { object, usage } = await generateObject({
    model: createModel(config),
    schema: EditPlanSchema,
    system: PLANNER_SYSTEM_PROMPT,
    prompt: buildPlannerPrompt(input),
  });
  return { plan: object, usage };
}

/** Produce a validated EditPlan from a natural-language instruction (BYOK). */
export async function planEdits(
  input: PlanEditsInput,
  config: LLMProviderConfig,
): Promise<EditPlan> {
  return (await planEditsWithUsage(input, config)).plan;
}
