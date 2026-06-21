import type { CaseResult } from "./types";

/** Aggregated, serializable result of an eval run. */
export interface Report {
  total: number;
  passed: number;
  passRate: number;
  byDimension: Record<"validity" | "scope" | "soundness" | "assertions", number>;
  avgTokens: number;
  totalTokens: number;
  results: CaseResult[];
}

/**
 * Reduce raw per-case results into pass/dimension rates and token totals. Rates
 * are over the number of results (cases × samples). Empty input yields 0 rates
 * (guard against divide-by-zero) rather than NaN.
 */
export function aggregate(results: CaseResult[]): Report {
  const denom = results.length || 1;
  const rate = (k: "validity" | "scope" | "soundness" | "assertions"): number =>
    results.filter((r) => r[k] === true).length / denom;
  const passed = results.filter((r) => r.pass).length;
  const totalTokens = results.reduce((n, r) => n + r.tokens, 0);
  return {
    total: results.length,
    passed,
    passRate: passed / denom,
    byDimension: {
      validity: rate("validity"),
      scope: rate("scope"),
      soundness: rate("soundness"),
      assertions: rate("assertions"),
    },
    avgTokens: Math.round(totalTokens / denom),
    totalTokens,
    results,
  };
}

/** Render a plain-text report: one line per case plus two summary lines. */
export function renderConsole(r: Report): string {
  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  const rows = r.results
    .map((c) => {
      const detail = c.error
        ? `  ERR ${c.error}`
        : c.problems.length
          ? `  ${c.problems.join(" | ")}`
          : "";
      return `  ${c.pass ? "✓" : "✗"} ${c.id.padEnd(22)} ops:${String(c.opCount).padStart(2)} tok:${String(c.tokens).padStart(5)}${detail}`;
    })
    .join("\n");
  return [
    rows,
    "",
    `Pass ${r.passed}/${r.total} (${pct(r.passRate)})  |  validity ${pct(r.byDimension.validity)}  scope ${pct(r.byDimension.scope)}  soundness ${pct(r.byDimension.soundness)}  assert ${pct(r.byDimension.assertions)}`,
    `Tokens: ${r.totalTokens} total, ${r.avgTokens} avg/case`,
  ].join("\n");
}
