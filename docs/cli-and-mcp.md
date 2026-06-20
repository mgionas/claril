# Claril CLI & MCP — lint BPMN outside the app

The deterministic BPMN logic inspector is exposed outside the web app two ways:

- **CLI** — `claril lint <file.bpmn>` for local use and CI gates.
- **MCP server** — `claril mcp`, a stdio MCP server so AI agents / IDEs can lint BPMN.

Both reuse `@claril/logic-inspector` (the rules) and `@claril/bpmn-parse` (headless
BPMN 2.0 XML → `ProcessGraph` via `bpmn-moddle`, no browser/DOM). **No AI key is
required** — this is pure Tier‑1 deterministic analysis.

## Packages

| Package              | Role                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `@claril/bpmn-parse` | `parseBpmnXml(xml)` → `{ graph, warnings }`. Headless, reusable by CLI, MCP, and any future REST surface. |
| `@claril/cli`        | `claril` binary: `lint` and `mcp` subcommands.                                                            |

## Install

In the monorepo (packages ship raw TS; the `claril` bin loads them via `tsx`):

```bash
pnpm install
# run directly:
node packages/cli/bin/claril.js lint path/to/model.bpmn
# or, once linked:
pnpm --filter @claril/cli exec claril lint path/to/model.bpmn
```

## CLI usage

```
claril lint <file.bpmn|glob...> [--json] [--quiet]
claril mcp
claril --help | --version
```

`lint` options:

- `--json` — emit machine-readable findings (array of `{ source, findings, parseWarnings }`).
- `--quiet` — text mode, but only print files that have findings.

Multiple files and globs are supported (`claril lint "diagrams/**/*.bpmn"`). Quote
globs so your shell does not expand them first.

### Example (human-readable)

```
$ claril lint bad.bpmn
bad.bpmn
  error    structural/missing-end-event  Process has no end event.
      fix: Add an end event so the process can complete.
  error    structural/unreachable-node  "Never reached" is unreachable from any start event.  (Orphan)
      fix: Connect it from the main flow, or remove it.
  warning  best-practice/unlabeled-gateway  Decision gateway "Gw_1" is unlabeled; name the question it answers.  (Gw_1)
  2 error, 4 warning, 0 info

1 file: 2 error, 4 warning, 0 info
```

Colors are emitted only on a TTY and are disabled when `NO_COLOR` is set.

## Exit-code contract (CI gate)

| Code | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| `0`  | No **error**-severity findings (warnings / info are allowed).                    |
| `1`  | At least one **error**-severity finding. Use this as the CI gate.                |
| `2`  | Usage error: no files matched, a file could not be read, or the XML is not BPMN. |

Example CI step:

```yaml
- run: node packages/cli/bin/claril.js lint "diagrams/**/*.bpmn"
  # fails the job on exit 1 (errors) or 2 (usage problems)
```

## MCP server

`claril mcp` starts a stdio MCP server (`@modelcontextprotocol/sdk`) named
`claril-lint`, exposing one tool:

### `lint_bpmn`

- **Input**: `{ xml?: string, path?: string }` — provide inline BPMN XML or an
  absolute file path (one is required).
- **Output** (`structuredContent`, also mirrored as JSON text):
  `{ source, ok, counts: { error, warning, info }, findings[], parseWarnings[] }`
  where `ok` is `true` when there are no error-severity findings. Each finding is
  `{ ruleId, severity, message, elementId?, quickFix? }`.

### Client config snippet

Claude Desktop / any MCP client (`mcpServers` entry):

```json
{
  "mcpServers": {
    "claril": {
      "command": "node",
      "args": ["/abs/path/to/claril/packages/cli/bin/claril.js", "mcp"]
    }
  }
}
```

Once the CLI is published / linked on `PATH`, this simplifies to:

```json
{
  "mcpServers": {
    "claril": { "command": "claril", "args": ["mcp"] }
  }
}
```

## What gets linted

The parser mirrors the browser `bpmnRegistryToGraph` (in `apps/web/lib/bpmn-to-graph.ts`):
start/end/intermediate events, tasks (and typed tasks), gateways, sub-processes
(flattened), and sequence flows as edges. Container elements (process,
collaboration, participant, lanes) are skipped. The same rule set runs as in the
web app, so CLI/MCP findings match the editor exactly.
