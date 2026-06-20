import { parseBpmnXml } from "@claril/bpmn-parse";
import { inspect, type ProcessGraph } from "@claril/logic-inspector";
import type { Finding, Severity } from "@claril/shared";

/** Findings produced for a single BPMN source. */
export interface LintResult {
  /** A label for the source (file path, or "<stdin>"/"<xml>"). */
  source: string;
  graph: ProcessGraph;
  findings: Finding[];
  /** Non-fatal moddle parse warnings (recoverable XML issues). */
  parseWarnings: string[];
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Lint a single BPMN XML string: parse -> graph -> inspect. Pure (no I/O,
 * no process.exit). Reused by the CLI and the MCP server.
 */
export async function lintXml(xml: string, source = "<xml>"): Promise<LintResult> {
  const { graph, warnings } = await parseBpmnXml(xml);
  const findings = inspect(graph).sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  return { source, graph, findings, parseWarnings: warnings };
}

/** True when any finding is error-severity (drives the CLI exit code). */
export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === "error");
}

/** Count findings by severity. */
export function tally(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}
