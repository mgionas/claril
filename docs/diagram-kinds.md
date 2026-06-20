# Diagram kinds

A Project holds typed, first-class diagrams freely (no forced C4 hierarchy). Each
diagram has a **kind** persisted as the `diagram.type` column (`diagram_type`
enum, default `'bpmn'`).

| Kind       | `type` value | V1 editor                          | Stored content        |
| ---------- | ------------ | ---------------------------------- | --------------------- |
| BPMN       | `bpmn`       | **bpmn-js** canvas (source of truth) | BPMN 2.0 XML          |
| Sequence   | `sequence`   | **Mermaid** split-pane editor      | Mermaid `sequenceDiagram` source |
| C4         | `c4`         | **Mermaid** split-pane editor      | Mermaid `C4Context` source |

## V1 notes

- **Sequence and C4 are Mermaid-based in V1.** The editor (`mermaid-editor.tsx`)
  is a split pane: raw Mermaid source on the left, a live debounced preview on
  the right. The diagram `content` is the Mermaid **text** (text-as-code),
  autosaved via the shared `saveDiagramContent` action. Mermaid runs client-side
  only (dynamic import, `ssr: false`).
- The dispatch boundary lives in `workbench.tsx`: `kind === 'bpmn'` renders the
  bpmn-js workbench; every other kind renders the Mermaid workbench. This keeps
  a clean `DiagramEditor`-by-kind abstraction so a richer native editor (e.g.
  LikeC4 / Structurizr DSL for C4, a visual sequence lib) can replace Mermaid
  for a single kind later without touching persistence or dispatch.
- **The deterministic inspector, AI advisor, and Asset Catalog binding are
  BPMN-only.** They depend on the BPMN object model and are not mounted for
  Sequence or C4 in V1.

## Creating a diagram

The dashboard "New diagram" control is a kind picker (BPMN / Sequence / C4).
`createDiagram(projectId, kind)` seeds kind-appropriate starter content (see
`lib/default-diagram.ts`: `seedForKind` / `defaultNameForKind`).
