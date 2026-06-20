import { generateText } from "ai";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";
import type { AssetContext } from "./grounding";
import { describeGrounding } from "./advisor";

/** Input for a grounded natural-language Q&A over the diagram. */
export interface QuestionInput {
  graph: ProcessGraph;
  /** Deterministic inspector findings, used to ground the answer. */
  findings: Finding[];
  /** The user's natural-language question about the diagram. */
  question: string;
  /**
   * Optional Asset Catalog grounding — real service semantics for the bound
   * elements, so answers reason over actual systems, SLAs and dependencies.
   */
  assetContext?: AssetContext;
}

const QA_SYSTEM_PROMPT = `You are Claril's AI assistant answering questions about a specific BPMN process model.

You are given the exact process graph (nodes + flows), the deterministic logic inspector's findings, and — when available — the real systems bound to elements from the Asset Catalog. These are FACTS and they are the ONLY source of truth.

Rules:
- Answer the user's question directly and concisely, in prose (Markdown allowed for short lists).
- Ground every claim in the provided graph / findings / assets. Refer to elements by their names, not their ids.
- If the answer is not determinable from the provided context, say so plainly rather than guessing.
- Do not invent steps, roles, systems, SLAs, or relationships that are not present.
- Keep it focused — no restating the whole process unless that is what was asked.`;

/**
 * Answer a user's natural-language question about the diagram, grounded on the
 * deterministic graph + findings and (optionally) the Asset Catalog. Returns a
 * prose answer. Provider-agnostic: the model is built from BYOK config.
 */
export async function answerQuestion(
  input: QuestionInput,
  config: LLMProviderConfig,
): Promise<string> {
  const { text } = await generateText({
    model: createModel(config),
    system: QA_SYSTEM_PROMPT,
    prompt: [
      describeGrounding(input),
      "",
      `USER QUESTION: ${input.question}`,
    ].join("\n"),
  });
  return text.trim();
}
