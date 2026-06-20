import { generateObject, type LanguageModelUsage } from "ai";
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

export function describeGraph(graph: ProcessGraph): string {
  const nodes = graph.nodes
    .map(
      (n) =>
        `- ${n.id} [${n.type}]${n.name ? ` "${n.name}"` : ""}${n.lane ? ` {lane: ${n.lane}}` : ""}`,
    )
    .join("\n");
  const flows = (graph.flows ?? [])
    .map((f) => `- ${f.id}: ${f.sourceRef} -> ${f.targetRef}${f.name ? ` (${f.name})` : ""}`)
    .join("\n");

  const sections = [`NODES:\n${nodes || "(none)"}`, `FLOWS:\n${flows || "(none)"}`];

  const pools = graph.pools ?? [];
  const lanes = graph.lanes ?? [];
  if (pools.length > 0 || lanes.length > 0) {
    const laneLines = lanes
      .map(
        (l) => `- ${l.id}${l.name ? ` "${l.name}"` : ""}${l.pool ? ` (pool: ${l.pool})` : ""}`,
      )
      .join("\n");
    const poolLine = pools.length
      ? `Pools: ${pools.map((p) => p.name || p.id).join(", ")}\n`
      : "";
    sections.push(
      `POOLS & LANES (use a lane id as containerRef to place a node in that lane):\n${poolLine}${laneLines}`,
    );
  }

  const messageFlows = graph.messageFlows ?? [];
  if (messageFlows.length > 0) {
    const mf = messageFlows
      .map((f) => `- ${f.id}: ${f.sourceRef} -> ${f.targetRef}${f.name ? ` (${f.name})` : ""}`)
      .join("\n");
    sections.push(`MESSAGE FLOWS (between pools):\n${mf}`);
  }

  return sections.join("\n\n");
}

export function describeFindings(findings: Finding[]): string {
  if (findings.length === 0) return "(none)";
  return findings
    .map((f) => `- [${f.severity}] ${f.ruleId}${f.elementId ? ` @${f.elementId}` : ""}: ${f.message}`)
    .join("\n");
}

/**
 * Compact, grounded prompt block shared by every advisor capability: the
 * process graph, the deterministic findings, and (when present) the Asset
 * Catalog facts. Each capability appends its own task instruction.
 */
export function describeGrounding(input: {
  graph: ProcessGraph;
  findings: Finding[];
  assetContext?: AssetContext;
}): string {
  return [
    "PROCESS GRAPH:",
    describeGraph(input.graph),
    "",
    "DETERMINISTIC FINDINGS (facts from the logic inspector):",
    describeFindings(input.findings),
    "",
    "BOUND ASSETS (Asset Catalog — real service semantics; use these facts):",
    describeAssetContext(input.assetContext),
  ].join("\n");
}

function buildPrompt(input: AdviseInput): string {
  return [
    describeGrounding(input),
    "",
    input.question
      ? `Focus your review on this concern: ${input.question}`
      : "Review the model and report your advisory findings.",
  ].join("\n");
}

/**
 * Run the AI advisor over a process graph, grounded on the deterministic
 * findings. Returns typed Findings tagged with `source: "advisor"`.
 */
export async function adviseWithUsage(
  input: AdviseInput,
  config: LLMProviderConfig,
): Promise<{ value: Finding[]; usage: LanguageModelUsage }> {
  const { object, usage } = await generateObject({
    model: createModel(config),
    schema: advisorSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
  });

  const value: Finding[] = object.findings.map((f) => ({
    ruleId: "advisor",
    severity: f.severity,
    message: f.message,
    elementId: f.elementId,
    quickFix: f.quickFix,
    source: "advisor" as const,
  }));
  return { value, usage };
}

export async function advise(input: AdviseInput, config: LLMProviderConfig): Promise<Finding[]> {
  return (await adviseWithUsage(input, config)).value;
}
