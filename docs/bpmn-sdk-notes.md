# BPMN SDK notes (bpmn-js / diagram-js / bpmn-moddle / bpmn-auto-layout)

Hard-won, non-obvious findings about the canvas/parser/layout stack. Keep this
current when you discover new SDK quirks so the next person doesn't re-learn them.

**Pinned versions** (as of 2026-06-22): `bpmn-js@18.18.0`,
`diagram-js@15.17.0` (transitive), `bpmn-auto-layout@1.3.0`,
`bpmn-moddle@10.0.0`. Class names / CSS variables below are version-specific —
re-verify after a major bump.

---

## bpmn-auto-layout — what it CAN'T do

`layoutProcess(xml)` is the only export. Documented limitations (from its README,
confirmed in source):

- **Collaborations: only the FIRST participant's process is laid out.** Extra
  pools are ignored.
- **Message flows are NOT laid out** (no DI edge produced).
- Not laid out at all: Groups, Text annotations, Associations.
- Sub-processes render as **collapsed**.

Consequence: it cannot lay out a real multi-pool collaboration. This is why the
generator prompt historically forbade pools — and why we built our own pass.

### Our workaround: `layoutCollaboration()` (`packages/bpmn-parse`)

- Single process / ≤1 participant → delegate to `layoutProcess` unchanged.
- Multi-pool: lay out **each participant's process independently** by wrapping it
  in a standalone `<definitions>` and calling `layoutProcess`, then harvest its
  DI, **stack pools vertically** with a left name-band, align widths, and
  **synthesize message-flow `BPMNEdge`s** (orthogonal, exit/enter facing sides).
- The generator (`packages/ai-advisor/generate-bpmn.ts`) now emits a
  `<collaboration>` only when the prompt names genuinely independent parties.

---

## bpmn-moddle — parsing & building DI headlessly

- Import: `import { BpmnModdle } from "bpmn-moddle"` (named export; **no default**).
- `await moddle.fromXML(xml)` → `{ rootElement }` (the `bpmn:Definitions`).
- `await moddle.toXML(element, { format: true })` → `{ xml }`.
- `moddle.create("type", props)` builds an element.

DI object graph (after `layoutProcess`):
- `definitions.diagrams[0]` → `bpmndi:BPMNDiagram`; `.plane` →
  `bpmndi:BPMNPlane`; `.plane.planeElement` → array of `BPMNShape` / `BPMNEdge`.
- `BPMNShape.bounds` → `{ x, y, width, height }` (a `dc:Bounds`).
- `BPMNEdge.waypoint` → `[{ x, y }]` (array of `dc:Point`).
- Build DI with `moddle.create("dc:Bounds", …)`, `"dc:Point"`,
  `"bpmndi:BPMNShape" | "BPMNPlane" | "BPMNDiagram" | "BPMNEdge"`.

Gotchas:
- A `bpmnElement` reference must point at an element from the **same moddle
  instance** you're serializing. When harvesting DI from a second instance (e.g.
  a per-process `layoutProcess` result), map the laid-out shape's
  `bpmnElement.id` back to the **original** element via an id→element index.
- To slice one process into its own document for layout:
  `moddle.create("bpmn:Definitions", { rootElements: [process] })` then `toXML`
  (reusing the shared process object is fine for serialization).
- `parseBpmnXml` (our wrapper) collects nodes/flows from **all** root processes +
  the collaboration; `graph.flows` = sequence flows only (message flows live on
  the collaboration, not `flowElements`).

---

## Theming bpmn-js for dark mode (`apps/web/app/globals.css`)

**The cascade gotcha:** `diagram-js.css` is bundled/loaded **after** our
`globals.css`. So an override with **equal specificity** to a diagram-js rule
**loses** (later wins). Two robust strategies:

1. **Override the CSS variables**, not the rules. diagram-js defines its theme
   custom properties on `.djs-parent`. Redefine them with a **doubled-class**
   selector (`.djs-parent.djs-parent { … }`) to beat diagram-js regardless of
   load order. This is how we killed the **white canvas flash on drag**:
   - `--shape-drop-allowed-fill-color`, `--shape-drop-not-allowed-fill-color`,
     `--shape-connect-allowed-fill-color` default to ~97%-lightness grey/red and
     are painted as the **full canvas `svg.new-parent` / `svg.drop-not-ok`
     background** during drag → blinding on dark. Re-point them to subtle tints.
   - `--tooltip-error-background-color` similarly near-white.
2. **Doubled-class selectors** for rules (e.g. `svg.new-parent.new-parent`).

**Renderer fills are SVG presentation attributes, not CSS** — so a plain
`.djs-element .djs-visual > rect { fill: … !important }` beats them regardless of
load order (attributes lose to any CSS). That's why our base shape theming works
but the drop-background theming needed the variable trick.

**Inline styles** (e.g. the rename box bg) are beaten by `!important` in a
stylesheet.

### Class-name map (what to target)
- Shapes/edges: `.djs-element`, `.djs-shape`, `.djs-connection`, `.djs-visual`,
  `.djs-label`, `.djs-dragger` (drag preview), `.djs-outline` (selection/hover).
- Palette / context pad (we **hide both**: `.djs-palette`, `.djs-context-pad`
  `display:none` — Claril uses a custom palette + right-click menu).
- **Replace / "Change element" popup** (`popupMenu` `bpmn-replace`):
  `.djs-popup`, `.djs-popup-header`, `.djs-popup-title`, `.djs-popup-search` +
  `.djs-popup-search input`, `.djs-popup-search-icon`, `.djs-popup-body`,
  `.djs-popup-results`, `.djs-popup-group`, `.djs-popup-body .entry-header`,
  `.djs-popup-body .entry` / `.djs-popup .entry.selected` / `.entry.disabled`,
  `.djs-popup-entry-icon` (bpmn-font glyph, follows `color`),
  `.djs-popup-entry-content` / `-name` / `-description`,
  `.djs-popup-breadcrumbs-item*`.
- **Rename (direct editing) box**: `.djs-direct-editing-parent` (container, bg set
  inline → needs `!important`), `.djs-direct-editing-content` (contenteditable).
- **Validation error tooltip**: `.djs-tooltip-error` (e.g. "flow elements must be
  children of pools/participants").
- Drag/drop feedback: canvas `svg.new-parent` / `svg.drop-not-ok` (background),
  `.djs-shape.new-parent|.drop-ok|.connect-ok|.drop-not-ok .djs-visual` (fills),
  `.djs-element.attach-ok`.

---

## Keyboard bindings (bound by the Modeler's KeyboardModule)

Single-key tool shortcuts (bpmn-js `BpmnKeyboardBindings`; fire when the canvas
is focused and not in an input):
`F` find · `S` space tool · `L` lasso · `H` hand · `C` global connect ·
`E` direct editing (rename) · `R` replace/change element · `⌘/Ctrl+A` select all.

Base editor actions (diagram-js `KeyboardBindings`):
undo `⌘Z` · redo `⌘⇧Z` (`Ctrl+Y`) · cut `⌘X` · copy `⌘C` · paste `⌘V` ·
duplicate `⌘D` · delete `⌫`/Delete · zoom in `⌘+`/`⌘=` · zoom out `⌘−` ·
reset zoom `⌘0`.

These are mirrored in the in-app shortcuts modal (the `⌘K` "K" button →
`command-bar.tsx`). Keep that list in sync if bindings change. Our canvas guards
the keyboard so it's ignored while typing in inputs/contenteditable.

---

## Playwright testing the canvas (live verification)

- Synthetic `MouseEvent`/`contextmenu`/`dblclick` dispatched on canvas nodes do
  **not** reliably trigger bpmn-js direct-editing, drag previews, or the custom
  context menu — diagram-js tracks real pointer movement and the `.djs-hit`
  overlay intercepts clicks.
- Workarounds that DO work: `browser_evaluate` to **read computed styles / CSS
  variables** and the element registry, or to JS-click React buttons in the AI
  drawer. For element ids, query `.djs-element[data-element-id]`.
- The popup-menu / tool shortcuts CAN be opened by selecting an element then
  dispatching the key (`r`, `e`) since the keyboard binds at the SVG.
