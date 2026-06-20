import { readFile } from "node:fs/promises";
import { BpmnParseError } from "@claril/bpmn-parse";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { hasErrors, lintXml, tally } from "./lint";

/** Version reported to MCP clients; kept in sync with package.json by hand. */
const SERVER_VERSION = "0.1.0";

const lintInputShape = {
  xml: z.string().optional().describe("Raw BPMN 2.0 XML to lint. Provide this or `path`."),
  path: z
    .string()
    .optional()
    .describe("Absolute path to a .bpmn file to read and lint (server-side)."),
};

const findingShape = z.object({
  ruleId: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  elementId: z.string().optional(),
  quickFix: z.string().optional(),
});

const lintOutputShape = {
  source: z.string(),
  ok: z.boolean().describe("True when there are no error-severity findings."),
  counts: z.object({ error: z.number(), warning: z.number(), info: z.number() }),
  findings: z.array(findingShape),
  parseWarnings: z.array(z.string()),
};

/**
 * Build (but do not start) the Claril MCP server. Exposes one tool,
 * `lint_bpmn`, that runs the deterministic logic inspector over BPMN XML and
 * returns structured findings. Deterministic — needs no AI key.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "claril-lint",
    version: SERVER_VERSION,
  });

  server.registerTool(
    "lint_bpmn",
    {
      title: "Lint BPMN",
      description:
        "Run Claril's deterministic BPMN logic inspector over a BPMN 2.0 diagram " +
        "and return structural / best-practice findings (errors, warnings, info). " +
        "Accepts inline XML or a file path. No AI key required.",
      inputSchema: lintInputShape,
      outputSchema: lintOutputShape,
    },
    async ({ xml, path }) => {
      let source = "<xml>";
      let bpmnXml = xml;

      if (!bpmnXml && path) {
        source = path;
        try {
          bpmnXml = await readFile(path, "utf8");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [{ type: "text", text: `Cannot read file ${path}: ${message}` }],
          };
        }
      }

      if (!bpmnXml) {
        return {
          isError: true,
          content: [{ type: "text", text: "Provide either `xml` or `path`." }],
        };
      }

      try {
        const result = await lintXml(bpmnXml, source);
        const counts = tally(result.findings);
        const structured = {
          source: result.source,
          ok: !hasErrors(result.findings),
          counts,
          // Project to the output schema (drop the editor-only `fix` payload).
          findings: result.findings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            message: f.message,
            ...(f.elementId ? { elementId: f.elementId } : {}),
            ...(f.quickFix ? { quickFix: f.quickFix } : {}),
          })),
          parseWarnings: result.parseWarnings,
        };
        return {
          // structuredContent for programmatic clients; text for human display.
          structuredContent: structured,
          content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
        };
      } catch (err) {
        const message =
          err instanceof BpmnParseError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
      }
    },
  );

  return server;
}

/** Start the MCP server over stdio. Resolves when the transport closes. */
export async function runMcpStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep the process alive; stdio transport handles message loop + shutdown.
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
}
