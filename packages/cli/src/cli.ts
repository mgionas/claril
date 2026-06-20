import { EXIT, runLint } from "./commands/lint-command";

const HELP = `claril - deterministic BPMN logic inspector

Usage:
  claril lint <file.bpmn|glob...> [--json] [--quiet]
  claril mcp
  claril --help | --version

Commands:
  lint   Parse BPMN, run the logic inspector, print findings.
  mcp    Start a stdio MCP server exposing the lint_bpmn tool.

lint options:
  --json    Emit machine-readable findings (JSON) instead of text.
  --quiet   Only print files that have findings (text mode).

Exit codes:
  0   no error-severity findings
  1   at least one error-severity finding (use as a CI gate)
  2   usage error (no files matched / unreadable / unparseable)
`;

interface ParsedLintArgs {
  patterns: string[];
  json: boolean;
  quiet: boolean;
}

function parseLintArgs(args: string[]): ParsedLintArgs {
  const patterns: string[] = [];
  let json = false;
  let quiet = false;
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg === "--quiet" || arg === "-q") quiet = true;
    else if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
    else patterns.push(arg);
  }
  return { patterns, json, quiet };
}

/** Parse argv (without node/script) and run. Returns the exit code. */
export async function run(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(HELP);
    return EXIT.ok;
  }

  if (command === "--version" || command === "-v") {
    process.stdout.write("0.1.0\n");
    return EXIT.ok;
  }

  if (command === "lint") {
    let parsed: ParsedLintArgs;
    try {
      parsed = parseLintArgs(rest);
    } catch (err) {
      process.stderr.write(`claril lint: ${(err as Error).message}\n`);
      return EXIT.usage;
    }
    return runLint(parsed);
  }

  if (command === "mcp") {
    // Lazy import so the MCP SDK isn't loaded for plain `lint` runs.
    const { runMcpStdio } = await import("./mcp-server");
    await runMcpStdio();
    return EXIT.ok;
  }

  process.stderr.write(`claril: unknown command "${command}"\n\n${HELP}`);
  return EXIT.usage;
}
