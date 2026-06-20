import type { Finding, Severity } from "@claril/shared";
import { tally, type LintResult } from "./lint";

/** ANSI colors, disabled when not a TTY or when NO_COLOR is set. */
const useColor = (): boolean => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint = (code: string, text: string): string => (useColor() ? `[${code}m${text}[0m` : text);

const dim = (t: string) => paint("2", t);
const bold = (t: string) => paint("1", t);

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "error",
  warning: "warning",
  info: "info",
};

const colorSeverity = (s: Severity): string => {
  const label = SEVERITY_LABEL[s];
  if (s === "error") return paint("31", label); // red
  if (s === "warning") return paint("33", label); // yellow
  return paint("36", label); // cyan
};

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

/** One finding line: "  <severity>  <ruleId>  <message>  [element]". */
function formatFinding(f: Finding): string {
  const where = f.elementId ? dim(`  (${f.elementId})`) : "";
  const fix = f.quickFix ? `\n      ${dim("fix: " + f.quickFix)}` : "";
  return `  ${colorSeverity(f.severity).padEnd(useColor() ? 18 : 8)} ${dim(f.ruleId)}  ${f.message}${where}${fix}`;
}

/** Human-readable report for a single file, grouped by severity. */
export function formatResult(result: LintResult): string {
  const lines: string[] = [bold(result.source)];

  for (const warning of result.parseWarnings) {
    lines.push(`  ${paint("33", "parse-warning")}  ${warning}`);
  }

  if (result.findings.length === 0) {
    lines.push(`  ${paint("32", "OK")}  no findings`);
    return lines.join("\n");
  }

  for (const severity of SEVERITY_ORDER) {
    const group = result.findings.filter((f) => f.severity === severity);
    for (const f of group) lines.push(formatFinding(f));
  }

  const counts = tally(result.findings);
  lines.push(dim(`  ${counts.error} error, ${counts.warning} warning, ${counts.info} info`));
  return lines.join("\n");
}

/** Summary footer across all linted files. */
export function formatSummary(results: LintResult[]): string {
  const totals = { error: 0, warning: 0, info: 0 };
  for (const r of results) {
    const c = tally(r.findings);
    totals.error += c.error;
    totals.warning += c.warning;
    totals.info += c.info;
  }
  const fileWord = results.length === 1 ? "file" : "files";
  return bold(
    `\n${results.length} ${fileWord}: ${totals.error} error, ${totals.warning} warning, ${totals.info} info`,
  );
}
