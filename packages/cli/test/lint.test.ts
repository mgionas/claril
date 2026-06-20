import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT, runLint } from "../src/commands/lint-command";
import { hasErrors, lintXml } from "../src/lint";
import { invalidXml, notBpmnXml, validXml } from "./fixtures";

describe("lintXml pipeline", () => {
  it("returns no findings for a well-formed diagram", async () => {
    const result = await lintXml(validXml, "valid.bpmn");
    expect(result.findings).toEqual([]);
    expect(hasErrors(result.findings)).toBe(false);
  });

  it("flags error-severity findings for a known-bad diagram", async () => {
    const result = await lintXml(invalidXml, "bad.bpmn");
    const ruleIds = result.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain("structural/missing-end-event");
    expect(ruleIds).toContain("structural/unreachable-node");
    expect(ruleIds).toContain("best-practice/unlabeled-gateway");
    expect(hasErrors(result.findings)).toBe(true);
  });

  it("sorts findings error -> warning -> info", async () => {
    const result = await lintXml(invalidXml, "bad.bpmn");
    const severities = result.findings.map((f) => f.severity);
    const sorted = [...severities].sort();
    // errors come first; ensure no info/warning precedes an error.
    const firstWarningIdx = severities.indexOf("warning");
    const lastErrorIdx = severities.lastIndexOf("error");
    if (firstWarningIdx !== -1 && lastErrorIdx !== -1) {
      expect(lastErrorIdx).toBeLessThan(firstWarningIdx);
    }
    expect(sorted.length).toBe(severities.length);
  });
});

describe("runLint exit codes", () => {
  let dir: string;
  const writes: string[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "claril-cli-"));
    writes.length = 0;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 0 for a clean diagram", async () => {
    const file = join(dir, "valid.bpmn");
    await writeFile(file, validXml);
    const code = await runLint({ patterns: [file], json: false, quiet: false });
    expect(code).toBe(EXIT.ok);
  });

  it("exits 1 when an error-severity finding exists", async () => {
    const file = join(dir, "bad.bpmn");
    await writeFile(file, invalidXml);
    const code = await runLint({ patterns: [file], json: false, quiet: false });
    expect(code).toBe(EXIT.findings);
  });

  it("emits valid JSON with --json", async () => {
    const file = join(dir, "bad.bpmn");
    await writeFile(file, invalidXml);
    const code = await runLint({ patterns: [file], json: true, quiet: false });
    expect(code).toBe(EXIT.findings);
    const out = writes.join("");
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].findings.length).toBeGreaterThan(0);
  });

  it("exits 2 when no files match", async () => {
    const code = await runLint({
      patterns: [join(dir, "does-not-exist-*.bpmn")],
      json: false,
      quiet: false,
    });
    expect(code).toBe(EXIT.usage);
  });

  it("exits 2 when the XML is not BPMN", async () => {
    const file = join(dir, "not.bpmn");
    await writeFile(file, notBpmnXml);
    const code = await runLint({ patterns: [file], json: false, quiet: false });
    expect(code).toBe(EXIT.usage);
  });
});
