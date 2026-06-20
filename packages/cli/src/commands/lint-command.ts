import { readFile } from "node:fs/promises";
import { BpmnParseError } from "@claril/bpmn-parse";
import { glob } from "tinyglobby";
import { z } from "zod";
import { formatResult, formatSummary } from "../format";
import { hasErrors, lintXml, type LintResult } from "../lint";

/**
 * Exit-code contract (documented in docs/cli-and-mcp.md):
 *   0  no error-severity findings (warnings/info allowed)
 *   1  at least one error-severity finding (CI gate)
 *   2  usage error (no files matched, unreadable file, unparseable XML)
 */
export const EXIT = { ok: 0, findings: 1, usage: 2 } as const;

const optionsSchema = z.object({
  json: z.boolean().default(false),
  quiet: z.boolean().default(false),
});

export interface LintCommandInput {
  patterns: string[];
  json: boolean;
  quiet: boolean;
}

/** Resolve file args (literal paths and globs) to a de-duplicated file list. */
async function resolveFiles(patterns: string[]): Promise<string[]> {
  const matches = await glob(patterns, {
    absolute: true,
    onlyFiles: true,
    // Treat a literal existing path as itself even if it isn't a glob.
    expandDirectories: false,
  });
  return [...new Set(matches)].sort();
}

/**
 * Run `claril lint`. Returns the process exit code; never calls process.exit
 * itself so it stays testable.
 */
export async function runLint(input: LintCommandInput): Promise<number> {
  const { json, quiet } = optionsSchema.parse(input);

  if (input.patterns.length === 0) {
    process.stderr.write("claril lint: no input files\n");
    return EXIT.usage;
  }

  const files = await resolveFiles(input.patterns);
  if (files.length === 0) {
    process.stderr.write(`claril lint: no files matched: ${input.patterns.join(", ")}\n`);
    return EXIT.usage;
  }

  const results: LintResult[] = [];
  let usageError = false;

  for (const file of files) {
    let xml: string;
    try {
      xml = await readFile(file, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`claril lint: cannot read ${file}: ${message}\n`);
      usageError = true;
      continue;
    }

    try {
      results.push(await lintXml(xml, file));
    } catch (err) {
      if (err instanceof BpmnParseError) {
        process.stderr.write(`claril lint: ${file}: ${err.message}\n`);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`claril lint: ${file}: ${message}\n`);
      }
      usageError = true;
    }
  }

  if (json) {
    const payload = results.map((r) => ({
      source: r.source,
      findings: r.findings,
      parseWarnings: r.parseWarnings,
    }));
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else if (!quiet) {
    for (const r of results) process.stdout.write(formatResult(r) + "\n\n");
    process.stdout.write(formatSummary(results) + "\n");
  } else {
    // --quiet: only print files that have findings.
    for (const r of results) {
      if (r.findings.length > 0) process.stdout.write(formatResult(r) + "\n\n");
    }
  }

  if (usageError) return EXIT.usage;
  const anyErrors = results.some((r) => hasErrors(r.findings));
  return anyErrors ? EXIT.findings : EXIT.ok;
}
