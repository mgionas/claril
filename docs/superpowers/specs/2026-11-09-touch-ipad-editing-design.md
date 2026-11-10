# Touch / iPad full-editing UX — design

**Status:** approved (brainstorm) · **Date:** 2026-11-09 · **Owner:** @mgionas

## Goal

Make **iPad a first-class BPMN authoring device** — not just view/review. A user
on an iPad, with a finger and/or an Apple Pencil, can draw, move, connect,
rename, inspect, and comment on diagrams end-to-end, in **both orientations**,
without a keyboard or mouse.

**Non-goals (this spec):**
- Phones / sub-tablet editing. iPad is the target; smaller coarse-pointer
  screens may degrade.
- Collaboration (presence, live cursors, review workflow). That is a **separate
  track** (roadmap P4: W16 shipped, W17 review + W18 multiplayer ahead) with its
  own spec. This spec does **not** add presence code.
- Heavy management-shell redesign. The shadcn sidebar already has a mobile
  drawer; management surfaces get only a light touch-target/reflow pass.

## Locked decisions

| Decision | Choice |
|---|---|
| Scope | Full editing on the canvas (first-class authoring) |
| Devices | iPad, **both orientations** (panels reflow for portrait) |
| Apple Pencil | **Precision tool** — draw-to-connect + fine handles; finger stays forgiving |
| Collaboration | Separate track; not in this spec |
| Interaction model | **Direct manipulation + Pencil** (modeless finger gestures; tap-driven toolbar replaces hover) |
| Desktop | **Pixel-identical** — every change gated behind a coarse-pointer check |

## Guiding principle

**Desktop stays provably untouched.** Everything in this spec activates only
behind a coarse-pointer gate (`@media (pointer: coarse)` + a `data-coarse` root
attribute). Mouse/keyboard users see zero visual or behavioral change. The 148
existing `hover:` affordances remain exactly as-is for fine pointers.

---

## Section 1 — Architecture & component boundaries

bpmn-js is **18.18** (native Pointer Events; the old Hammer-based diagram-js
touch module is gone, so we build a thin custom gesture layer rather than fight
internals).

New units, each with one purpose and a well-defined interface:

1. **`useCoarsePointer()`** (hook) — the single switch. Returns whether the
   primary input is coarse via `matchMedia('(pointer: coarse)')`, reactive to
   hot-plugged devices. Stamps `data-coarse` on the workbench root so Tailwind
   can branch declaratively without threading a flag through every component.

2. **`canvas-touch-gestures.ts`** (framework-agnostic, attached to the
   bpmn-canvas container) — owns **multi-touch only**: 2-finger pinch →
   `canvas.zoom`, 2-finger drag → `canvas.scroll`, and it swallows Safari's
   native page pinch / double-tap-zoom. **Single-finger events pass straight
   through to diagram-js**, which already does tap-select, drag-empty-to-pan,
   and drag-element-to-move. The only seam to the modeler is `canvas.zoom` /
   `canvas.scroll`.

3. **Accidental-move guard** — raise diagram-js's `dragging` move-threshold for
   coarse pointers so a pan/tap isn't misread as a tiny element move, backed by
   existing undo.

4. **`CanvasSelectionToolbar`** (React overlay) — replaces the hover
   context-pad. Positioned over the selected element from its bbox + the canvas
   viewbox; buttons call the **same modeler services** the context pad / palette
   already use (append, connect, rename, delete, more→sheet). This is the heart
   of "no hover".

5. **`usePencil()` + draw-to-connect handler** — see Section 4.

**Integration:** wired in `bpmn-canvas.tsx` after modeler creation;
`bpmn-workbench.tsx` provides the `data-coarse` root and the reflow (Section 3).

## Section 2 — Replacing hover-dependent affordances

A Tailwind **`coarse:` variant** is registered once (keyed on
`@media (pointer: coarse)` + `data-coarse`) so we branch styling declaratively
instead of hand-editing 148 call sites.

Audit the existing `hover:` usages into three buckets:

1. **Decorative hover** (color darken, subtle elevation) — lose it on touch,
   harmless. Confirm it's not functional; no further work.
2. **Functional hover-reveal** — controls that go `opacity-0 →
   hover:opacity-100` (row actions, delete-on-hover, card overflow). Under
   `coarse:` become **always-visible** or get a persistent `⋮` affordance. This
   is the bulk of the real work.
3. **Tooltips** (shadcn/Radix — deliberately don't open on touch). Rule:
   icon-only controls that *depend* on a tooltip to be understood get a
   **visible label under `coarse:`**; purely informational tooltips become
   **tap-popovers**.

Three touch entry points to add:

- **Right-click context menu** (`canvas-context-menu.tsx`) → also triggered by
  **long-press**, and surfaced from the selection toolbar's `⋮ more`.
- **⌘K command palette** → a **visible command/search button** in the app bar
  (keyboard-free entry).
- **Element palette** (`canvas-palette.tsx`) → larger targets + **tap-to-place**
  (tap element, tap canvas) alongside the existing drag.

**Hit targets:** enforce a **≥44×44 pt** minimum for interactive controls under
`coarse:` (palette, toolbar, context-pad entries, close buttons) — a focused
sizing pass.

## Section 3 — Layout & orientation reflow

The workbench is a **canvas-maximal, floating-panel** layout. Panels **float
over the canvas and never reflow it**, so bpmn-js geometry stays stable; we only
re-fit on rotate.

Two regimes, chosen by **width + orientation** (not the 768 px phone
breakpoint), owned by a single **`useWorkbenchLayout()`** hook:

- **Landscape / wide** (~1024×768): keep the desktop floating-panel layout with
  `coarse:` sizing. Minimal change.
- **Portrait / narrow** (~768×1024): side-docked panels (AI drawer, palette)
  become **dismissible bottom-sheets / slide-overs** via the existing shadcn
  **`Sheet`** (same primitive as the sidebar mobile drawer — consistency, no new
  component). Canvas keeps full width; a panel is one tap away and dismisses back
  to full canvas.

**Orientation change:** on rotate, re-fit via `canvas.zoom('fit-viewport')`,
reposition the selection toolbar, switch panels between docked ↔ sheet mode.

**Safe areas:** respect `env(safe-area-inset-*)` so panels/toolbar never sit
under the home indicator (portrait / standalone).

**Management shell:** light pass only — confirm tables/cards reflow and controls
meet 44 pt. Not gold-plated (canvas is the priority).

## Section 4 — Apple Pencil precision layer

The Pencil resolves the core tension of direct manipulation — finger-drag-on-node
is ambiguous between **move** and **connect** — by splitting on instrument:

- **Finger = arrange** (move, pan, select — forgiving, large thresholds).
- **Pencil = connect + precise** (draw relationships, grab fine handles).

**Detection:** `pointerType === 'pen'` on the native PointerEvent (no
heuristics). Stamp `data-pen` vs `data-finger`.

**Draw-to-connect (headline):** a pen-down starting on a node routes into
diagram-js's existing **`connect` service** (`connect.start(event, source)`)
instead of move/pan; diagram-js draws the rubber-band and, on drop over a
target, creates the flow — **sequence flow** within a pool, **message flow**
across pools (same rules the planner/validator encode). We wire the pen to a
service bpmn-js already ships; we do not reimplement connection logic.

**Precision affordances when pen is active:** expose the diagram-js
**bendpoint / reconnect handles** at finger-hostile sizes (a stylus can hit
them). Finger mode keeps them hidden to avoid mis-grabs.

**Palm rejection:** while a pen is the active pointer, ignore stray finger
`pointerdown`s on the canvas (pointerType filtering).

**No hard dependency:** every Pencil accelerator has a finger equivalent —
connect is always reachable via the selection toolbar's `→ connect`
(tap source → tap target). Pencil speeds you up; it's never required.

## Section 5 — Testing & validation

Touch *feel* can't be proven by unit tests or a desktop browser, so validation
is layered — heaviest where it's cheap and deterministic.

1. **Pure logic → vitest** (matches the repo's pure-helper habit): coarse-pointer
   classification, the layout-regime decision (`width+orientation →
   narrow/portrait`), pinch/pan gesture math (touch deltas → zoom/scroll),
   `pointerType` → arrange-vs-connect routing, accidental-move threshold.
2. **Component/interaction → existing setup:** `CanvasSelectionToolbar`
   positioning from bbox+viewbox, Sheet reflow, tap-to-place.
3. **Playwright touch emulation** (repo already uses Playwright MCP): headless
   iPad profile (`hasTouch`, both orientations) — tap selects, long-press opens
   the context menu, 2-finger changes the viewbox, draw-to-connect creates a
   flow. Covers the deterministic integration path, not true multi-touch feel.
4. **Real-device smoke pass** (scripted checklist, actual iPad Safari + Pencil,
   both orientations) — the only way to catch Safari quirks (native pinch,
   scroll-chaining, safe areas, tap latency). Checklist authored here; the
   **user runs it** (the agent can't drive hardware).

**Definition of done (acceptance scenario):** *On an iPad, in both orientations,
build a 2-pool / ~10-node diagram end-to-end by touch — palette-add, move,
connect (finger toolbar + Pencil), rename, run the inspector, comment — with no
keyboard or mouse.*

**Desktop regression guard:** assert `data-coarse` is absent / the `coarse:`
layer never activates for fine pointers, so desktop stays provably untouched.

---

## Component summary

| Unit | Kind | Responsibility |
|---|---|---|
| `useCoarsePointer()` | hook | Detect coarse pointer; stamp `data-coarse` root |
| `canvas-touch-gestures.ts` | module | Multi-touch pinch/pan → `canvas.zoom/scroll`; swallow native gestures |
| accidental-move guard | config | Raise dragging threshold on coarse |
| `CanvasSelectionToolbar` | React overlay | Tap-driven replacement for hover context-pad |
| `usePencil()` + draw-to-connect | hook/handler | Route pen drags into diagram-js `connect`; precision handles; palm rejection |
| `useWorkbenchLayout()` | hook | narrow/portrait regime; docked ↔ sheet |
| `coarse:` Tailwind variant | styling | Declarative touch branch for the 148 `hover:` audit + 44 pt targets |

## Open questions / risks

- **diagram-js internal hooks** (exact `dragging` threshold config, `connect`
  service signature, bendpoint handle sizing) to be confirmed against 18.18
  during planning — altitude is right, the exact API wiring is an
  implementation detail.
- **Safari native-gesture suppression** may need `touch-action: none` on the
  canvas plus `preventDefault` discipline; validate on device early.
- Real-device feel is the acceptance gate automated tests can't replace.
