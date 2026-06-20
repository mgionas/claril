export { run } from "./cli";
export { runLint, EXIT, type LintCommandInput } from "./commands/lint-command";
export { lintXml, hasErrors, tally, type LintResult } from "./lint";
export { formatResult, formatSummary } from "./format";
export { createMcpServer, runMcpStdio } from "./mcp-server";
