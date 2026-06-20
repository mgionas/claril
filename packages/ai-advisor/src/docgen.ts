import { generateText } from "ai";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";
import type { AssetContext } from "./grounding";
import { describeGrounding } from "./advisor";

/** Input for grounded documentation generation. Mirrors {@link AdviseInput}. */
export interface DocGenInput {
  graph: ProcessGraph;
  /** Deterministic inspector findings, used to ground the narrative. */
  findings: Finding[];
  /**
   * Optional Asset Catalog grounding — real service semantics for the bound
   * elements, so the doc names the actual systems instead of shape labels.
   */
  assetContext?: AssetContext;
}

const DOC_SYSTEM_PROMPT = `You are Claril's AI documentation writer. You turn a BPMN process model into clear, accurate Markdown documentation for a technical-but-mixed audience (architects, analysts, ops).

You are given the exact process graph (nodes + flows), the deterministic logic inspector's findings, and — when available — the real systems bound to elements from the Asset Catalog. These are FACTS. Document only what is in them; never invent steps, roles, or systems.

Write the document with these Markdown sections (omit a section only if there is genuinely nothing to say):
1. "# <Process name or 'Process Documentation'>" then a short "## Overview" paragraph describing the purpose and the start-to-end shape of the process.
2. "## Step-by-step flow" — an ordered walkthrough following the sequence flows from the start event(s) to the end event(s). Reference task names; keep each step to a sentence or two.
3. "## Decision points" — for each gateway, the question it asks and the named outgoing branches (use flow labels). Omit if there are no gateways.
4. "## Roles & participants" — lanes/pools/participants if present. Omit if none.
5. "## Bound systems & services" — only when assets are provided: list each bound element with its system, its relevant capabilities/SLA/data-classification fields, and dependencies. Omit entirely if no assets are bound.

Rules:
- Be concise and factual. No filler, no marketing tone.
- Do NOT include the raw node/flow ids in prose; use names. If an element has no name, describe it by type.
- Do NOT restate inspector findings as a list, but you may note a material risk in one sentence if it affects how the process reads.
- Output ONLY the Markdown document, no preamble or code fences around the whole thing.`;

/**
 * Generate human-readable Markdown documentation for a process, grounded on the
 * deterministic graph + findings and (optionally) the Asset Catalog. Returns
 * the Markdown string. Provider-agnostic: the model is built from BYOK config.
 */
export async function generateProcessDoc(
  input: DocGenInput,
  config: LLMProviderConfig,
): Promise<string> {
  const { text } = await generateText({
    model: createModel(config),
    system: DOC_SYSTEM_PROMPT,
    prompt: [
      describeGrounding(input),
      "",
      "Write the process documentation now, following the section structure exactly.",
    ].join("\n"),
  });
  return text.trim();
}
