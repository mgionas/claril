# Connected Board — Slice 1 design

**Status:** approved (brainstorm) · **Date:** 2026-11-11 · **Owner:** @mgionas

## North star (context)

Claril is a **connected architecture workbench with memory** for enterprise
architects, system analysts, and service experts. The value is connective: every
diagram/board/element/decision lives in one knowledge graph, the AI understands
*across* artifacts, and it fights architectural amnesia (forgotten connections and
decisions between meetings). Teams build systems by referencing a shared,
versioned catalog of real services/endpoints and by reusing/comparing what
already exists. Full vision: memory `connected-architecture-workbench-vision`.

Layers (each its own spec→plan→build cycle): **L0** shared editor shell ·
**L1** catalog-as-service-SoR + knowledge graph · **L2** composable boards ·
**L3** cross-artifact AI + memory · plus Sequence/C4 upgrades. We build in **thin
vertical slices** that prove the vision before heavy infra. Free-draw library =
**Excalidraw (MIT)** (not tldraw — commercial-license conflict with the AGPL
strategy).

## This slice (Slice 1) — "The connected board"

A thin, end-to-end proof touching every layer shallowly. The aha: **diagrams are
composable, connected, and the AI understands across them.**

1. A new **`board`** diagram type — a freeform Excalidraw canvas (draw, sticky
   notes, shapes, freehand; Miro-style).
2. **Embed a live BPMN tile** — place an existing BPMN on the board; it renders
   its *current* state (refreshes on open), you annotate on/around it, and
   clicking it opens the real BPMN editor.
3. A **"Related across diagrams" panel** — select a BPMN tile → a deterministic
   list of other diagrams that reference the **same catalog assets** (authored
   links via `elementAssetBinding`), plus a short **AI narrative** that reminds
   you of those connections.

### Out of scope (later slices — do NOT build here)

Catalog-reference authoring ("pick an endpoint from a list") + reuse/compare
(**Slice 2**); versioned catalog + Jira import; a dedicated knowledge-graph
table; `assetLink` indirect-relation traversal; decision/ADR capture; proactive
reminders; live interactive nested editors; embedding non-BPMN kinds; binding
arbitrary board notes to assets; Sequence/C4 upgrades; the **L0** shell
extraction. Visual version **diff** for boards (boards get version list + restore
only).

## Architecture

The board is a **new editor behind the existing `apps/web/components/workbench.tsx`
per-kind dispatch**. It stands alone — reusing only the kind-agnostic infra
Mermaid already uses (autosave, `saveDiagramContent`, `TopBar`, app shell). We do
**not** extract the L0 shell in this slice.

New/changed units, each with one clear responsibility:

| Unit | Kind | Responsibility |
|---|---|---|
| `diagram_type` enum + `DiagramKind` + `seedForKind`/`defaultNameForKind` | schema/types | add `"board"`; seed = empty Excalidraw scene |
| `workbench.tsx` branch | dispatch | route `board` → `BoardWorkbench` |
| `BoardWorkbench` | React shell | `TopBar` + board canvas + autosave (mirrors `MermaidWorkbench`) |
| `BoardCanvas` | React (client-only) | Excalidraw mount; scene ↔ `content` JSON; embed insert; live refresh; selection → Related |
| `useDiagramSvg()` | hook/util (client) | transient bpmn-js **Viewer** → current SVG data-URL for a referenced BPMN |
| `diagram-ref` element helpers | pure | build/parse the Excalidraw image element carrying `customData={type:"diagram-ref",diagramId}` + hyperlink |
| `getRelatedForDiagram(diagramId)` | server action | deterministic related-diagrams-by-shared-asset (see §Links) |
| `groupRelationsByAsset(bindings)` | pure fn | the relation-grouping core (unit-tested) |
| `summarizeRelations(diagramId)` | server action | AI narrative grounded on the deterministic relations (BYOK) |
| `buildRelationsPrompt(relations)` | pure fn | the narrative prompt (unit-tested) |
| `RelatedPanel` | React | deterministic list (links) + AI narrative + graceful degrade |

## Board editor & embedding

- **Excalidraw** (`@excalidraw/excalidraw`, MIT, latest stable — pin at plan time)
  mounted client-only via dynamic import (like `bpmn-canvas`). Initial scene
  hydrates from `content`; `onChange` serializes `{elements, appState-subset}`
  and schedules a save through `useAutosave(saveDiagramContent)`. Sticky notes,
  shapes, text, freehand are native Excalidraw — no custom work.
- **Content** = Excalidraw scene JSON in the existing `content` text column. No
  persistence change beyond the enum value. A deserialize guard tolerates
  empty/legacy content (new/empty board = empty scene).
- **Embedded BPMN tile:**
  - An Excalidraw **image element**, source = the referenced BPMN's **current
    SVG** as a data-URL, with `customData = { type: "diagram-ref", diagramId }`
    and the element **hyperlink** set to `/d/[diagramId]`.
  - **Insert:** a board toolbar action "Embed diagram" → pick from the project's
    diagrams → render + place the tile.
  - **SVG source:** `useDiagramSvg` spins a transient, off-screen bpmn-js
    **Viewer** (lighter than Modeler), `importXML` → `saveSVG` → data-URL.
    Access to the referenced diagram's content is fetched through an
    access-gated server read (`assertDiagramAccess`).
  - **Live refresh:** on board open, each `diagram-ref` element re-fetches its
    diagram's content and regenerates the image (bounded to refs on the board).
  - **Open:** the element's native hyperlink opens the real BPMN editor.

## Cross-artifact links (via asset bindings)

Deterministic, no new schema. Reuses `elementAssetBinding
{ organizationId, diagramId, elementId, assetId }`.

`getRelatedForDiagram(diagramId)` (server, org-scoped, access-gated):
1. Load `elementAssetBinding` rows for `diagramId` → the set of asset ids this
   BPMN uses.
2. For each asset, find other `elementAssetBinding` rows with the same `assetId`
   and a different `diagramId`; join diagram `name`/`type` and collect
   `elementIds`.
3. Return grouped by asset:
   `{ asset: {id, name}, relatedDiagrams: [{id, name, kind, elementIds}] }[]`,
   excluding the source diagram.

`groupRelationsByAsset(rows)` is a **pure function** over the fetched rows (the
grouping/exclusion logic) — unit-tested with fixtures; only the DB read is I/O.

Personal-scope boards: assets are org-only, so the panel shows an empty-state
hint (no error). *(Banked: traverse `assetLink` for indirect relations.)*

## AI "Related across diagrams" panel

`RelatedPanel`, opened from a selected `diagram-ref` tile's "Related" action:
- **Deterministic list**: the `getRelatedForDiagram` result rendered as clickable
  links to each related diagram (grouped by asset). Reliable, AI-independent.
- **AI narrative**: `summarizeRelations(diagramId)` passes the *real* relation
  list + asset names to the existing BYOK advisor (`getAiConfig(ctx)`) via
  `buildRelationsPrompt`, returning a 2–3 sentence reminder. **Grounded strictly
  on the deterministic list — the model narrates, it never invents relations.**
  If AI isn't configured, the list shows without narrative (graceful degrade).
- `buildRelationsPrompt(relations)` is pure/testable; the LLM call is the only
  new I/O.

## Persistence, tenancy, testing

- **Persistence:** one migration adds `board` to the `diagram_type` enum. Content
  = Excalidraw scene JSON string. Autosave + version snapshot/restore work as-is
  (opaque string). Visual version **diff** stays BPMN-only (boards: list +
  restore only).
- **Tenancy:** boards live under an org `project` or a `personalProject` like any
  diagram (the existing XOR), guarded by `assertDiagramAccess`. Embedding/refresh
  reads of a referenced BPMN are access-gated. The Related panel is org-scope
  (assets are org-only).
- **Testing:**
  - Pure units (vitest): `groupRelationsByAsset`, `buildRelationsPrompt`,
    `diagram-ref` build/parse, scene (de)serialize guard.
  - A dispatch guard test: `workbench.tsx` still routes `bpmn`/`sequence`/`c4`
    unchanged (board is purely additive).
  - Excalidraw render + transient-Viewer SVG generation verified by running the
    app (no new e2e infra; mirrors how Mermaid/BPMN are checked).
- **Desktop/existing editors:** untouched — new kind is additive; the dispatch
  guard test pins it.

## Risks / open items

- Transient bpmn-js **Viewer** per embedded tile (client-only) — bounded to refs
  on the board; lazy-instantiated and disposed after SVG capture.
- Excalidraw bundle size — lazy-loaded, client-only (like bpmn-js).
- Scene JSON size in the `content` column — fine at slice scale.
- Excalidraw's exact API for programmatic element insert / `customData` /
  element hyperlinks to be confirmed against the pinned version at plan time
  (the approach — image element + `customData` + link — is supported; the exact
  method names are an implementation detail).
