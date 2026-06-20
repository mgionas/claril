import { generateObject } from "ai";
import { z } from "zod";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";
import { describeAssetContext, type AssetContext } from "./grounding";

const advisorSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(["error", "warning", "info"]),
      message: z.string(),
      elementId: z.string().optional(),
      quickFix: z.string().optional(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are Claril's AI architecture advisor. You review BPMN process models for Solution Architects.

A deterministic logic inspector has ALREADY found the structural defects (deadlocks, unreachable nodes, gateway mismatches, etc.) and they are given to you. Do NOT restate them.

Your job is JUDGMENT the deterministic engine cannot make:
- anti-patterns and over-complex structures
- steps that are candidates for automation
- naming / clarity / consistency problems
- risks and simplification opportunities

Rules:
- Be specific and concise. One finding per issue.
- Reference the elementId when a finding is about a specific element.
- Prefer "warning" or "info"; reserve "error" for genuine correctness risks.
- If the model looks healthy, return an empty findings array.`;

export interface AdviseInput {
  graph: ProcessGraph;
  /** Deterministic inspector findings, used to ground the model. */
  findings: Finding[];
  /** Optional user question to focus the review. */
  question?: string;
  /**
   * Optional Asset Catalog grounding — real service semantics for the bound
   * elements. Lets the advisor reason over capabilities, classification, SLAs
   * and dependencies instead of guessing from shape names.
   */
  assetContext?: AssetContext;
}

function describeGraph(graph: ProcessGraph): string {
  const nodes = graph.nodes
    .map((n) => `- ${n.id} [${n.type}]${n.name ? ` "${n.name}"` : ""}`)
    .join("\n");
  const flows = graph.flows
    .map((f) => `- ${f.sourceRef} -> ${f.targetRef}${f.name ? ` (${f.name})` : ""}`)
    .join("\n");
  return `NODES:\n${nodes || "(none)"}\n\nFLOWS:\n${flows || "(none)"}`;
}

function describeFindings(findings: Finding[]): string {
  if (findings.length === 0) return "(none)";
  return findings
    .map((f) => `- [${f.severity}] ${f.ruleId}${f.elementId ? ` @${f.elementId}` : ""}: ${f.message}`)
    .join("\n");
}

function buildPrompt(input: AdviseInput): string {
  return [
    "PROCESS GRAPH:",
    describeGraph(input.graph),
    "",
    "DETERMINISTIC FINDINGS (already reported — do not repeat):",
    describeFindings(input.findings),
    "",
    "BOUND ASSETS (Asset Catalog — real service semantics; use these facts):",
    describeAssetContext(input.assetContext),
    "",
    input.question ? `USER QUESTION: ${input.question}` : "Review the model and report your advisory findings.",
  ].join("\n");
}

/**
 * Run the AI advisor over a process graph, grounded on the deterministic
 * findings. Returns typed Findings tagged with `source: "advisor"`.
 */
export async function advise(input: AdviseInput, config: LLMProviderConfig): Promise<Finding[]> {
  const { object } = await generateObject({
    model: createModel(config),
    schema: advisorSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
  });

  return object.findings.map((f) => ({
    ruleId: "advisor",
    severity: f.severity,
    message: f.message,
    elementId: f.elementId,
    quickFix: f.quickFix,
    source: "advisor" as const,
  }));
}
