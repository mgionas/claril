import { generateText, type LanguageModelUsage } from "ai";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import { BPMN_BEST_PRACTICES } from "@claril/logic-inspector";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";
import type { AssetContext } from "./grounding";
import { describeGrounding } from "./advisor";
import { EditPlanSchema, NODE_TYPES, type EditPlan } from "./edit-plan";

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
- The model's pools/lanes are listed under POOLS & LANES, and each node shows its lane as {lane: …}. To put a new node in a specific lane, set containerRef to that lane's id. If you don't set containerRef, a node added into an existing flow automatically inherits the lane of the element it connects to — so only set it when the instruction names a different lane/actor.
- Prefer the smallest set of ops that satisfies the instruction. Do not restructure unrelated parts of the model.
- When your change would create an implicit split (a node with multiple outgoing flows) or an implicit merge (a node with multiple incoming flows), insert an explicit gateway instead — never wire multiple flows straight into/out of a task.
- To INSERT a node INTO an existing connection (e.g. "add X before/after/between …"): first deleteElement the existing sequenceFlow that currently joins those two nodes (reference it by its flow id, shown as "id: source -> target" in FLOWS), then addNode the new node and connect predecessor -> newNode and newNode -> successor. NEVER just connect the new node to one side and leave the original flow in place — that creates a duplicate/branched path. If you cannot find the existing flow's id in FLOWS, do not guess.
- You can ONLY use the operations defined in OUTPUT FORMAT below, and updateElement changes an element's NAME only — it cannot move, reparent, restyle, or reconfigure anything. If the request needs an operation that isn't available (e.g. set a flow condition expression, add a data object/annotation, change an event's type or definition, configure loop/multi-instance markers), DO NOT emit no-op or unrelated ops. Instead return {"summary": "<one line: what isn't supported yet + the closest supported alternative>", "ops": []}.
- "summary" is a one-line human description of the change.

OUTPUT FORMAT — respond with ONLY a single JSON object (no markdown, no code fences, no prose before or after):
{"summary": string, "ops": Op[]}
Each Op is exactly one of these shapes (omit optional fields you don't need):
- {"kind":"addPool","tempId":string,"name":string}
- {"kind":"addLane","tempId":string,"poolRef":string,"name":string}
- {"kind":"addNode","tempId":string,"type":${NODE_TYPES.map((t) => `"${t}"`).join("|")},"name"?:string,"containerRef"?:string}
- {"kind":"connect","fromRef":string,"toRef":string,"flow":"sequence"|"message","label"?:string}
- {"kind":"updateElement","elementId":string,"name"?:string}
- {"kind":"deleteElement","elementId":string}
- {"kind":"moveToContainer","elementId":string,"containerRef":string}  // move an EXISTING element into a different lane/pool — containerRef is a lane/pool id from POOLS & LANES
"tempId" is a short placeholder (e.g. "t1") you assign to elements you create in THIS plan, so later ops can reference them; "fromRef"/"toRef"/"containerRef"/"poolRef" take either a tempId from this plan or an existing element id. To add a node into the flow, emit an addNode then connect ops wiring it to existing ids. If no change is warranted, return {"summary": "...", "ops": []}.

${BPMN_BEST_PRACTICES}`;

/** Pure: assemble the user-facing prompt (grounding + instruction). Testable. */
export function buildPlannerPrompt(input: PlanEditsInput): string {
  const grounding = describeGrounding({
    graph: input.graph,
    findings: input.findings,
    assetContext: input.assetContext,
  });
  return `CURRENT MODEL:\n${grounding}\n\nINSTRUCTION:\n${input.instruction}\n\nReturn the JSON edit plan now.`;
}

/**
 * Parse and validate the planner model's text response into an EditPlan.
 *
 * The planner uses `generateText` rather than `generateObject` so it stays
 * provider-neutral: provider-native structured output sends the Zod schema as a
 * response schema, but our op schema is a discriminated union (JSON-Schema
 * `anyOf`), which Google Gemini's response schema rejects. Instead we instruct
 * JSON-only output and validate it here with Zod. Tolerates code fences and
 * surrounding prose by extracting the outermost `{...}` object.
 */
export function parseEditPlanResponse(text: string): EditPlan {
  const fenced = text.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Planner did not return a JSON edit plan.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced.slice(start, end + 1));
  } catch {
    throw new Error("Planner returned malformed JSON.");
  }
  return EditPlanSchema.parse(parsed);
}

export async function planEditsWithUsage(
  input: PlanEditsInput,
  config: LLMProviderConfig,
): Promise<{ plan: EditPlan; usage: LanguageModelUsage }> {
  const { text, usage } = await generateText({
    model: createModel(config),
    system: PLANNER_SYSTEM_PROMPT,
    prompt: buildPlannerPrompt(input),
  });
  return { plan: parseEditPlanResponse(text), usage };
}

/** Produce a validated EditPlan from a natural-language instruction (BYOK). */
export async function planEdits(
  input: PlanEditsInput,
  config: LLMProviderConfig,
): Promise<EditPlan> {
  return (await planEditsWithUsage(input, config)).plan;
}
