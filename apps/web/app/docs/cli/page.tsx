import type { Metadata } from "next";
import { A, Callout, CodeBlock, DocHeader, H2, H3, InlineCode, Li, P, Ul } from "../_components/prose";

export const metadata: Metadata = {
  title: "CLI & MCP",
  description:
    "Run Claril's deterministic BPMN logic inspector outside the app: the claril CLI for local use and CI gates, and an MCP server so AI agents and IDEs can lint BPMN.",
};

export default function CliPage() {
  return (
    <article>
      <DocHeader
        eyebrow="CLI & MCP"
        title="Lint BPMN outside the app"
        intro="The deterministic BPMN logic inspector is exposed two ways outside the web app — a CLI for local use and CI gates, and an MCP server so AI agents and IDEs can lint BPMN."
      />

      <P>
        Both reuse <InlineCode>@claril/logic-inspector</InlineCode> (the rules) and{" "}
        <InlineCode>@claril/bpmn-parse</InlineCode> (headless BPMN 2.0 XML →{" "}
        <InlineCode>ProcessGraph</InlineCode> via <InlineCode>bpmn-moddle</InlineCode>, no browser or
        DOM). <strong>No AI key is required</strong> — this is pure Tier-1 deterministic analysis, so
        CLI / MCP findings match the editor exactly.
      </P>

      <H2 id="install">Install</H2>
      <P>
        In the monorepo, the <InlineCode>claril</InlineCode> binary loads the packages via{" "}
        <InlineCode>tsx</InlineCode>:
      </P>
      <CodeBlock>
        {`pnpm install

# run directly:
node packages/cli/bin/claril.js lint path/to/model.bpmn

# or, once linked:
pnpm --filter @claril/cli exec claril lint path/to/model.bpmn`}
      </CodeBlock>

      <H2 id="usage">CLI usage</H2>
      <CodeBlock>
        {`claril lint <file.bpmn|glob...> [--json] [--quiet]
claril mcp
claril --help | --version`}
      </CodeBlock>
      <P>
        <InlineCode>lint</InlineCode> options:
      </P>
      <Ul>
        <Li>
          <InlineCode>--json</InlineCode> — emit machine-readable findings (an array of{" "}
          <InlineCode>{`{ source, findings, parseWarnings }`}</InlineCode>).
        </Li>
        <Li>
          <InlineCode>--quiet</InlineCode> — text mode, but only print files that have findings.
        </Li>
      </Ul>
      <P>
        Multiple files and globs are supported (
        <InlineCode>claril lint &quot;diagrams/**/*.bpmn&quot;</InlineCode>). Quote globs so your
        shell does not expand them first. Colors are emitted only on a TTY and are disabled when{" "}
        <InlineCode>NO_COLOR</InlineCode> is set.
      </P>

      <H3>Example output</H3>
      <CodeBlock title="$ claril lint bad.bpmn">
        {`bad.bpmn
  error    structural/missing-end-event  Process has no end event.
      fix: Add an end event so the process can complete.
  error    structural/unreachable-node   "Never reached" is unreachable. (Orphan)
      fix: Connect it from the main flow, or remove it.
  warning  best-practice/unlabeled-gateway  Decision gateway "Gw_1" is unlabeled.

1 file: 2 error, 4 warning, 0 info`}
      </CodeBlock>

      <H2 id="exit-codes">Exit-code contract (CI gate)</H2>
      <Ul>
        <Li>
          <InlineCode>0</InlineCode> — no error-severity findings (warnings / info are allowed).
        </Li>
        <Li>
          <InlineCode>1</InlineCode> — at least one error-severity finding. Use this as the CI gate.
        </Li>
        <Li>
          <InlineCode>2</InlineCode> — usage error: no files matched, a file could not be read, or
          the XML is not BPMN.
        </Li>
      </Ul>
      <CodeBlock title="CI step">
        {`- run: node packages/cli/bin/claril.js lint "diagrams/**/*.bpmn"
  # fails the job on exit 1 (errors) or 2 (usage problems)`}
      </CodeBlock>

      <H2 id="mcp">MCP server</H2>
      <P>
        <InlineCode>claril mcp</InlineCode> starts a stdio MCP server (
        <InlineCode>@modelcontextprotocol/sdk</InlineCode>) named{" "}
        <InlineCode>claril-lint</InlineCode>, exposing one tool.
      </P>
      <H3>
        <InlineCode>lint_bpmn</InlineCode>
      </H3>
      <Ul>
        <Li>
          <strong>Input:</strong> <InlineCode>{`{ xml?: string, path?: string }`}</InlineCode> —
          provide inline BPMN XML or an absolute file path (one is required).
        </Li>
        <Li>
          <strong>Output:</strong> <InlineCode>structuredContent</InlineCode> (also mirrored as JSON
          text):{" "}
          <InlineCode>
            {`{ source, ok, counts: { error, warning, info }, findings[], parseWarnings[] }`}
          </InlineCode>
          , where <InlineCode>ok</InlineCode> is true when there are no error-severity findings. Each
          finding is{" "}
          <InlineCode>{`{ ruleId, severity, message, elementId?, quickFix? }`}</InlineCode>.
        </Li>
      </Ul>

      <H3>Client config</H3>
      <P>Claude Desktop / any MCP client (an entry in the client&apos;s server list):</P>
      <CodeBlock title="mcpServers entry">
        {`{
  "mcpServers": {
    "claril": {
      "command": "node",
      "args": ["/abs/path/to/claril/packages/cli/bin/claril.js", "mcp"]
    }
  }
}`}
      </CodeBlock>
      <P>Once the CLI is published / linked on your PATH, this simplifies to:</P>
      <CodeBlock>
        {`{
  "mcpServers": {
    "claril": { "command": "claril", "args": ["mcp"] }
  }
}`}
      </CodeBlock>

      <Callout>
        The parser mirrors the browser canvas: start / end / intermediate events, tasks (and typed
        tasks), gateways, sub-processes (flattened), and sequence flows as edges. Container elements
        (process, collaboration, participant, lanes) are skipped — so the same rule set runs as in
        the editor.
      </Callout>

      <P>
        Next: connect a model for the AI co-editor in <A href="/docs/ai-providers">AI providers</A>.
      </P>
    </article>
  );
}
