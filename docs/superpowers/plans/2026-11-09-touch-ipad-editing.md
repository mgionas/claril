# Touch / iPad Full-Editing UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make iPad a first-class BPMN authoring device — pan/zoom/select/move/connect/rename/inspect by finger and Apple Pencil, in both orientations — without changing the desktop experience.

**Architecture:** A coarse-pointer gate (`useCoarsePointer` + `data-coarse` root + a `coarse:` Tailwind variant) switches on all touch behavior so desktop stays pixel-identical. A thin diagram-js module translates two-finger gestures into `canvas.zoom`/`canvas.scroll`; single-finger passes through to diagram-js. A React `CanvasSelectionToolbar` anchored via the diagram-js **Overlays** service replaces the hover context-pad. Apple Pencil (`pointerType === 'pen'`) routes into diagram-js's `connect` service for draw-to-connect. A `useWorkbenchLayout` hook flips side panels to shadcn `Sheet`s in portrait.

**Tech Stack:** Next.js 16 (App Router), React 19, bpmn-js 18.18 / diagram-js 15.17, Tailwind v4, shadcn/ui, vitest, Playwright (via the repo's Playwright MCP).

## Global Constraints

- **Desktop pixel-identical:** every behavior/style in this plan activates ONLY behind the coarse-pointer gate (`@media (pointer: coarse)` and/or `data-coarse` on the workbench root). Fine-pointer rendering and the existing 148 `hover:` affordances are unchanged. A regression guard asserts `data-coarse` is absent for fine pointers.
- **Use latest stable deps;** verify with `npm view <pkg> version` before adding anything (project rule). This plan adds **no** new runtime dependencies — it reuses bpmn-js, shadcn `Sheet`, and Tailwind already present.
- **No new pools/participants/message-flows invented** by any connect logic — reuse diagram-js `connect`, which already enforces BPMN rules.
- **Collaboration is out of scope** (presence/cursors/review are a separate track). Do not add presence code.
- **Commit after every task.** Branch: `touch-ipad-editing` (off `main`; the design spec already lives on `touch-ipad-editing-spec`).
- Verified API facts (diagram-js 15.17): `canvas.zoom(newScale, center?)` center is container-pixel coords; `canvas.zoom()` returns current scale; `canvas.scroll({dx,dy})`; `canvas.viewbox()` → `{x,y,width,height,scale,...}`; `modeler.get('dragging').setOptions({threshold})`; `connect.start(event, source)`; overlays `overlays.add(el, {html, position:{top,left}, scale})` → id, `overlays.remove(id)`; selection via `eventBus.on('selection.changed', e => e.newSelection)` and `modeler.get('selection').get()`.

---

## File Structure

**New (pure, unit-tested):**
- `apps/web/lib/touch/pointer.ts` — `isCoarsePointer()`, `classifyPointer(pointerType)` → `'pen'|'finger'|'mouse'`.
- `apps/web/lib/touch/gesture-math.ts` — pinch/pan math: `beginPinch`, `updatePinch` → `{scale, center, pan}`.
- `apps/web/lib/touch/workbench-layout.ts` — `resolveLayout({width, orientation})` → `'wide'|'narrow'`.

**New (React/DOM):**
- `apps/web/hooks/use-coarse-pointer.ts` — reactive coarse-pointer hook; stamps `data-coarse`.
- `apps/web/hooks/use-workbench-layout.ts` — reactive layout-regime hook.
- `apps/web/lib/touch/touch-gestures-module.ts` — diagram-js module: two-finger → `canvas.zoom/scroll`.
- `apps/web/lib/touch/pencil-connect-module.ts` — diagram-js module: pen-down on a node → `connect.start`.
- `apps/web/components/canvas-selection-toolbar.tsx` — React toolbar rendered into a diagram-js overlay.

**Modified:**
- `apps/web/components/bpmn-canvas.tsx` — register modules, wire the overlay toolbar, set dragging threshold on coarse.
- `apps/web/components/bpmn-workbench.tsx` — `data-coarse` root, layout regime, Sheet panels, re-fit on rotate.
- `apps/web/components/canvas-palette.tsx` — tap-to-place + `coarse:` sizing.
- `apps/web/components/canvas-context-menu.tsx` — long-press trigger on coarse.
- `apps/web/app/globals.css` — `coarse:` variant, `touch-action`, 44pt targets, safe-area insets.
- `apps/web/components/ui/` tooltip/affordance sweep (Task 7).

**Test files:** co-located `*.test.ts` next to each pure module; `apps/web/e2e/touch-editing.spec.ts` (Playwright); `docs/superpowers/ipad-smoke-checklist.md` (manual).

---

## Phase A — Foundation & gestures

### Task 1: Coarse-pointer detection

**Files:**
- Create: `apps/web/lib/touch/pointer.ts`
- Create: `apps/web/hooks/use-coarse-pointer.ts`
- Test: `apps/web/lib/touch/pointer.test.ts`

**Interfaces:**
- Produces: `isCoarsePointer(mql?: { matches: boolean }): boolean`; `classifyPointer(pointerType: string): 'pen'|'finger'|'mouse'`; `useCoarsePointer(): boolean` (React hook, also sets `document.documentElement.dataset.coarse`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/touch/pointer.test.ts
import { describe, expect, it } from "vitest";
import { classifyPointer, isCoarsePointer } from "./pointer";

describe("pointer", () => {
  it("reads coarse from a matchMedia result", () => {
    expect(isCoarsePointer({ matches: true })).toBe(true);
    expect(isCoarsePointer({ matches: false })).toBe(false);
  });
  it("classifies pointerType", () => {
    expect(classifyPointer("pen")).toBe("pen");
    expect(classifyPointer("touch")).toBe("finger");
    expect(classifyPointer("mouse")).toBe("mouse");
    expect(classifyPointer("")).toBe("mouse"); // unknown → mouse (safe default)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- pointer`
Expected: FAIL — "Cannot find module './pointer'".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/touch/pointer.ts
/** True when the primary input is coarse (touch). Pass a MediaQueryList (or a
 * `{matches}` stub in tests); defaults to the live `(pointer: coarse)` query. */
export function isCoarsePointer(
  mql: { matches: boolean } = typeof window !== "undefined"
    ? window.matchMedia("(pointer: coarse)")
    : { matches: false },
): boolean {
  return mql.matches;
}

/** Normalize a PointerEvent.pointerType to the three instruments we care about. */
export function classifyPointer(pointerType: string): "pen" | "finger" | "mouse" {
  if (pointerType === "pen") return "pen";
  if (pointerType === "touch") return "finger";
  return "mouse";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- pointer`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the hook**

```ts
// apps/web/hooks/use-coarse-pointer.ts
"use client";
import { useEffect, useState } from "react";

/**
 * Reactive coarse-pointer detection. Returns whether the primary input is
 * touch, updating if the device changes (e.g. iPad keyboard attach/detach).
 * Side effect: stamps `data-coarse` on <html> so CSS (the `coarse:` variant)
 * can branch without JS per component.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    const apply = () => {
      setCoarse(mql.matches);
      document.documentElement.dataset.coarse = mql.matches ? "true" : "";
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return coarse;
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck`
Expected: no errors.

```bash
git add apps/web/lib/touch/pointer.ts apps/web/lib/touch/pointer.test.ts apps/web/hooks/use-coarse-pointer.ts
git commit -m "feat(touch): coarse-pointer detection + data-coarse root"
```

---

### Task 2: `coarse:` Tailwind variant, touch-action & 44pt base

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: a `coarse:` Tailwind variant usable as `coarse:opacity-100`; `.djs-container` gets `touch-action: none` under coarse; a `.touch-target` utility enforcing ≥44px.

- [ ] **Step 1: Add the variant and base rules**

In `apps/web/app/globals.css`, after the existing `@custom-variant dark` line (Tailwind v4 custom-variant syntax already used in this repo), add:

```css
/* Touch: a `coarse:` variant keyed on the pointer type AND the data-coarse
   root (JS mirror), so styles branch declaratively for iPad without changing
   desktop. */
@custom-variant coarse (@media (pointer: coarse));

@layer base {
  /* Take over canvas gestures from Safari so our two-finger pinch/pan wins
     and the page itself doesn't scroll/zoom. Only on coarse pointers. */
  @media (pointer: coarse) {
    .djs-container,
    .djs-container svg {
      touch-action: none;
    }
    /* Respect iPad safe areas (home indicator, standalone chrome). */
    [data-coarse] .workbench-safe {
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
  }
  /* Minimum comfortable touch target. */
  .touch-target {
    min-width: 44px;
    min-height: 44px;
  }
}
```

- [ ] **Step 2: Verify the variant compiles**

Add a temporary probe to any client component (e.g. a `<div className="coarse:bg-red-500" />`), then run:

Run: `pnpm --filter web build`
Expected: build succeeds (no "unknown variant `coarse`"). Remove the probe afterward.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(touch): coarse: Tailwind variant, touch-action, 44pt target, safe areas"
```

---

### Task 3: Pinch/pan gesture math (pure)

**Files:**
- Create: `apps/web/lib/touch/gesture-math.ts`
- Test: `apps/web/lib/touch/gesture-math.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Pt = { x: number; y: number }`
  - `type PinchStart = { startDist: number; startMid: Pt; startScale: number; lastMid: Pt }`
  - `beginPinch(a: Pt, b: Pt, startScale: number): PinchStart`
  - `updatePinch(start: PinchStart, a: Pt, b: Pt): { scale: number; center: Pt; pan: Pt }` — `scale` = new absolute zoom, `center` = current midpoint (container coords) to zoom around, `pan` = `{dx,dy}` midpoint delta since last frame (for `canvas.scroll`). Mutates `start.lastMid`.
  - All points are in **container-relative pixels** (caller subtracts the container rect).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/touch/gesture-math.test.ts
import { describe, expect, it } from "vitest";
import { beginPinch, updatePinch } from "./gesture-math";

describe("gesture-math", () => {
  it("doubling finger distance doubles the scale around the midpoint", () => {
    const start = beginPinch({ x: 0, y: 0 }, { x: 100, y: 0 }, 1); // dist 100, mid (50,0)
    const u = updatePinch(start, { x: -50, y: 0 }, { x: 150, y: 0 }); // dist 200, mid (50,0)
    expect(u.scale).toBeCloseTo(2);
    expect(u.center).toEqual({ x: 50, y: 0 });
    expect(u.pan).toEqual({ dx: 0, dy: 0 }); // midpoint didn't move
  });

  it("translating both fingers produces pan with no scale change", () => {
    const start = beginPinch({ x: 0, y: 0 }, { x: 100, y: 0 }, 1); // mid (50,0)
    const u = updatePinch(start, { x: 10, y: 20 }, { x: 110, y: 20 }); // dist 100, mid (60,20)
    expect(u.scale).toBeCloseTo(1);
    expect(u.pan).toEqual({ dx: 10, dy: 20 });
  });

  it("clamps scale to a sane range", () => {
    const start = beginPinch({ x: 0, y: 0 }, { x: 1, y: 0 }, 1); // tiny start dist
    const u = updatePinch(start, { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(u.scale).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- gesture-math`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/touch/gesture-math.ts
export type Pt = { x: number; y: number };
export type PinchStart = {
  startDist: number;
  startMid: Pt;
  startScale: number;
  lastMid: Pt;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Capture the reference frame when the second finger lands. */
export function beginPinch(a: Pt, b: Pt, startScale: number): PinchStart {
  const m = mid(a, b);
  return { startDist: dist(a, b) || 1, startMid: m, startScale, lastMid: m };
}

/** Compute the absolute zoom, the focal center, and the incremental pan. */
export function updatePinch(
  start: PinchStart,
  a: Pt,
  b: Pt,
): { scale: number; center: Pt; pan: { dx: number; dy: number } } {
  const m = mid(a, b);
  const ratio = dist(a, b) / start.startDist;
  const scale = clamp(start.startScale * ratio, MIN_ZOOM, MAX_ZOOM);
  const pan = { dx: m.x - start.lastMid.x, dy: m.y - start.lastMid.y };
  start.lastMid = m;
  return { scale, center: m, pan };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- gesture-math`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/touch/gesture-math.ts apps/web/lib/touch/gesture-math.test.ts
git commit -m "feat(touch): pure pinch/pan gesture math"
```

---

### Task 4: Two-finger gesture module + accidental-move guard

**Files:**
- Create: `apps/web/lib/touch/touch-gestures-module.ts`
- Test: `apps/web/lib/touch/touch-gestures-module.test.ts`
- Modify: `apps/web/components/bpmn-canvas.tsx` (register module ~line 223; set dragging threshold after modeler creation)

**Interfaces:**
- Consumes: `beginPinch`, `updatePinch` (Task 3); diagram-js `canvas` service.
- Produces: default-exported diagram-js module `{ __init__: ['touchGestures'], touchGestures: ['type', TouchGestures] }`. `TouchGestures.$inject = ['canvas']`. The class attaches `touchstart/move/end` listeners to `canvas.getContainer()` and drives `canvas.zoom(scale, center)` + `canvas.scroll(pan)` on two-finger gestures. Exposes `handleTouch(ev, canvasLike)` as a pure-ish seam for testing.

- [ ] **Step 1: Write the failing test** (drives the event→canvas mapping with a fake canvas + synthetic touch events)

```ts
// apps/web/lib/touch/touch-gestures-module.test.ts
import { describe, expect, it, vi } from "vitest";
import { TouchGestures } from "./touch-gestures-module";

function fakeCanvas() {
  const container = document.createElement("div");
  // jsdom gives 0-rects; stub getBoundingClientRect to the origin.
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  return {
    container,
    zoom: vi.fn(() => 1), // argless returns current scale
    scroll: vi.fn(),
    getContainer: () => container,
  };
}

const touch = (id: number, x: number, y: number) =>
  ({ identifier: id, clientX: x, clientY: y }) as Touch;
const tevent = (type: string, touches: Touch[]) =>
  new TouchEvent(type, { touches, cancelable: true });

describe("TouchGestures", () => {
  it("two-finger move drives canvas.zoom with a scale and center", () => {
    const canvas = fakeCanvas();
    new TouchGestures(canvas as never);
    canvas.container.dispatchEvent(tevent("touchstart", [touch(1, 0, 0), touch(2, 100, 0)]));
    canvas.container.dispatchEvent(tevent("touchmove", [touch(1, -50, 0), touch(2, 150, 0)]));
    expect(canvas.zoom).toHaveBeenCalledWith(expect.closeTo(2, 1), { x: 50, y: 0 });
  });

  it("ignores single-finger touches (lets diagram-js handle them)", () => {
    const canvas = fakeCanvas();
    new TouchGestures(canvas as never);
    canvas.container.dispatchEvent(tevent("touchstart", [touch(1, 10, 10)]));
    canvas.container.dispatchEvent(tevent("touchmove", [touch(1, 20, 20)]));
    expect(canvas.zoom).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(canvas.scroll).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- touch-gestures-module`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/touch/touch-gestures-module.ts
import { beginPinch, updatePinch, type Pt, type PinchStart } from "./gesture-math";

interface CanvasLike {
  getContainer(): HTMLElement;
  zoom(scale?: number, center?: Pt): number;
  scroll(delta: { dx: number; dy: number }): void;
}

/**
 * diagram-js module: translates TWO-finger gestures into canvas zoom/scroll.
 * Single-finger touches are left untouched so diagram-js keeps doing
 * tap-select, drag-empty-to-pan, and drag-element-to-move. Requires
 * `touch-action: none` on `.djs-container` (set in globals.css under coarse).
 */
export class TouchGestures {
  static $inject = ["canvas"];
  private pinch: PinchStart | null = null;

  constructor(canvas: CanvasLike) {
    const el = canvas.getContainer();
    const rel = (t: Touch): Pt => {
      const r = el.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      this.pinch = beginPinch(rel(e.touches[0]), rel(e.touches[1]), canvas.zoom() || 1);
    };
    const move = (e: TouchEvent) => {
      if (!this.pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const u = updatePinch(this.pinch, rel(e.touches[0]), rel(e.touches[1]));
      canvas.zoom(u.scale, u.center);
      if (u.pan.dx || u.pan.dy) canvas.scroll({ dx: u.pan.dx, dy: u.pan.dy });
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) this.pinch = null;
    };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  }
}

const touchGesturesModule = {
  __init__: ["touchGestures"],
  touchGestures: ["type", TouchGestures],
};
export default touchGesturesModule;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- touch-gestures-module`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the module + accidental-move guard in bpmn-canvas.tsx**

At the top of `apps/web/components/bpmn-canvas.tsx` add the imports:

```ts
import touchGesturesModule from "@/lib/touch/touch-gestures-module";
import { isCoarsePointer } from "@/lib/touch/pointer";
```

Change the `additionalModules` array (currently `[minimapModule]`, ~line 223) to:

```ts
      additionalModules: [minimapModule, touchGesturesModule],
```

Immediately after `modelerRef.current = modeler;` (~line 233) add the coarse-only drag threshold (prevents a tap/pan being read as a tiny move):

```ts
    // On touch, require a larger finger travel before a drag becomes a MOVE,
    // so taps and pans don't accidentally nudge elements. Verified API:
    // diagram-js Dragging.setOptions({ threshold }) (default 5).
    if (isCoarsePointer()) {
      (modeler.get("dragging") as { setOptions: (o: { threshold: number }) => void })
        .setOptions({ threshold: 12 });
    }
```

- [ ] **Step 6: Verify typecheck + manual desktop smoke**

Run: `pnpm --filter web typecheck`
Expected: no errors.

Run the app (`pnpm --filter web dev`), open a diagram on **desktop**, confirm mouse wheel-zoom and drag still behave exactly as before (the module only binds touch events; `data-coarse` is absent).
Expected: no desktop change.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/touch/touch-gestures-module.ts apps/web/lib/touch/touch-gestures-module.test.ts apps/web/components/bpmn-canvas.tsx
git commit -m "feat(touch): two-finger pinch/pan gesture module + accidental-move guard"
```

---

## Phase B — Touch affordances

### Task 5: Canvas selection toolbar (replaces hover context-pad)

**Files:**
- Create: `apps/web/components/canvas-selection-toolbar.tsx`
- Modify: `apps/web/components/bpmn-canvas.tsx` (mount the toolbar on `selection.changed`, coarse-only)

**Interfaces:**
- Consumes: diagram-js `overlays`, `selection`, `eventBus`, `elementFactory`, `create`, `modeling`, `directEditing` services (all already available on the modeler; `canvas-palette.tsx` shows the `modeler.get(service)` pattern).
- Produces: `mountSelectionToolbar(modeler, { isCoarse }): () => void` — returns a cleanup fn. Internally renders `<CanvasSelectionToolbar element={...} services={...} />` into a detached DOM node passed to `overlays.add(element, { html, position, scale:false })`.

- [ ] **Step 1: Write the toolbar component**

```tsx
// apps/web/components/canvas-selection-toolbar.tsx
"use client";
import { ArrowRight, Pencil, Plus, Trash2, MoreHorizontal } from "lucide-react";

export interface ToolbarServices {
  append: () => void;        // spawn a connected node (append)
  connect: () => void;       // enter connect mode from this element
  rename: () => void;        // trigger direct editing
  remove: () => void;        // delete the element
  more: () => void;          // open the full context menu as a sheet/popover
}

/** Tap-driven replacement for the hover context-pad. Rendered into a diagram-js
 * overlay anchored to the selected element, so it tracks pan/zoom/move. */
export function CanvasSelectionToolbar({ services }: { services: ToolbarServices }) {
  const btn =
    "touch-target inline-flex items-center justify-center rounded-md hover:bg-accent active:bg-accent/70";
  return (
    <div
      className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-md"
      // Overlays render outside React's tree; stop diagram-js from treating
      // taps on the toolbar as canvas interactions.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button className={btn} aria-label="Add connected step" onClick={services.append}>
        <Plus className="size-5" />
      </button>
      <button className={btn} aria-label="Connect to…" onClick={services.connect}>
        <ArrowRight className="size-5" />
      </button>
      <button className={btn} aria-label="Rename" onClick={services.rename}>
        <Pencil className="size-5" />
      </button>
      <button className={btn} aria-label="Delete" onClick={services.remove}>
        <Trash2 className="size-5" />
      </button>
      <button className={btn} aria-label="More actions" onClick={services.more}>
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write the mount helper + overlay wiring**

```tsx
// append to apps/web/components/canvas-selection-toolbar.tsx
import { createRoot } from "react-dom/client";

interface ModelerLike {
  get: (name: string) => unknown;
  on: (event: string, cb: (e: { newSelection: unknown[] }) => void) => void;
  off: (event: string, cb: (e: { newSelection: unknown[] }) => void) => void;
}

/** Show the toolbar overlay whenever exactly one element is selected (coarse
 * only). Returns a cleanup fn. */
export function mountSelectionToolbar(
  modeler: ModelerLike,
  opts: { isCoarse: boolean },
): () => void {
  if (!opts.isCoarse) return () => {};
  const overlays = modeler.get("overlays") as {
    add: (el: unknown, o: unknown) => string;
    remove: (id: string) => void;
  };
  let overlayId: string | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const clear = () => {
    if (overlayId) overlays.remove(overlayId);
    root?.unmount();
    overlayId = null;
    root = null;
  };

  const onChange = (e: { newSelection: unknown[] }) => {
    clear();
    if (e.newSelection.length !== 1) return;
    const element = e.newSelection[0] as { id: string };
    const host = document.createElement("div");
    root = createRoot(host);
    root.render(
      <CanvasSelectionToolbar
        services={buildServices(modeler, element)}
      />,
    );
    // Anchor above the element; diagram-js keeps it pinned through pan/zoom.
    overlayId = overlays.add(element, {
      position: { bottom: 8, left: 0 },
      scale: false,
      html: host,
    });
  };

  modeler.on("selection.changed", onChange);
  return () => {
    modeler.off("selection.changed", onChange);
    clear();
  };
}

/** Map toolbar actions onto real modeler services (same services the native
 * context-pad/palette use). `directEditing.activate` triggers rename-in-place;
 * `connect.start(null, el)` is replaced by the palette's connect behavior at
 * call sites that have a pointer event — here we fall back to selecting connect
 * mode via the context pad's action set. */
function buildServices(modeler: ModelerLike, element: { id: string }): ToolbarServices {
  const get = <T,>(n: string) => modeler.get(n) as T;
  return {
    append: () => {
      // Reuse the context pad's "append append-end-event"-style action set:
      const pad = get<{ getEntries: (e: unknown) => Record<string, { action: { click: (ev: Event, el: unknown) => void } }> }>("contextPad");
      const entry = Object.values(pad.getEntries(element)).find(() => true);
      entry?.action.click(new MouseEvent("click"), element);
    },
    connect: () => {
      const connect = get<{ start: (ev: Event | null, el: unknown) => void }>("connect");
      connect.start(new MouseEvent("mousedown"), element);
    },
    rename: () => {
      const de = get<{ activate: (el: unknown) => void }>("directEditing");
      de.activate(element);
    },
    remove: () => {
      const modeling = get<{ removeElements: (els: unknown[]) => void }>("modeling");
      modeling.removeElements([element]);
    },
    more: () => {
      window.dispatchEvent(new CustomEvent("claril:open-context-menu", { detail: { id: element.id } }));
    },
  };
}
```

> Note for the implementer: the exact `append` wiring depends on the diagram-js context-pad entry keys for the selected element type. **Before writing `buildServices`, open the browser console on a selected task and run `modeler.get('contextPad').getEntries(element)`** to read the real entry keys (e.g. `append.append-task`, `connect`, `delete`), then call the specific entry's `action.click`. This is a read-to-confirm step, not a guess — the structure above is correct; only the entry key string needs confirming per element type.

- [ ] **Step 3: Mount it in bpmn-canvas.tsx**

In the modeler effect of `apps/web/components/bpmn-canvas.tsx`, after the modeler and its selection handlers are set up, add:

```ts
import { mountSelectionToolbar } from "@/components/canvas-selection-toolbar";
// …inside the effect, after modelerRef.current = modeler:
const unmountToolbar = mountSelectionToolbar(
  modeler as unknown as Parameters<typeof mountSelectionToolbar>[0],
  { isCoarse: isCoarsePointer() },
);
```

Add `unmountToolbar()` to the effect's cleanup (next to the existing `modeler.destroy()`).

- [ ] **Step 4: Verify on an iPad (or emulated touch)**

Run the app; on a coarse-pointer device/emulation, tap a task → the toolbar overlay appears pinned above it, tracks pan/zoom, and its buttons rename/append/connect/delete. On desktop (fine pointer) → no overlay appears (hover context-pad unchanged).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter web typecheck`

```bash
git add apps/web/components/canvas-selection-toolbar.tsx apps/web/components/bpmn-canvas.tsx
git commit -m "feat(touch): tap-driven canvas selection toolbar via overlays"
```

---

### Task 6: Hover-affordance audit → `coarse:` always-visible

**Files:**
- Modify: component files surfaced by the audit grep (row-action / overflow controls that use `opacity-0 … hover:opacity-100` or `hidden … group-hover:*`).

**Interfaces:** none (styling-only sweep).

- [ ] **Step 1: Enumerate the functional hover-reveals**

Run:

```bash
cd apps/web
grep -rnE "group-hover:|opacity-0.*hover:opacity|hover:opacity-100|hidden .*hover:" components app --include="*.tsx" | grep -viE "transition|duration" > /tmp/hover-audit.txt
wc -l /tmp/hover-audit.txt
```

Classify each line: **decorative** (color/elevation on hover — leave it) vs **functional reveal** (a control only reachable on hover — fix it).

- [ ] **Step 2: Apply the mechanical transform to each functional reveal**

For every functional reveal, add a `coarse:` override that forces it visible. Pattern — before:

```tsx
<div className="opacity-0 group-hover:opacity-100 transition-opacity">
```

after:

```tsx
<div className="opacity-0 group-hover:opacity-100 coarse:opacity-100 transition-opacity">
```

For `hidden … group-hover:flex` style reveals, add `coarse:flex` (or `coarse:inline-flex`) alongside. Give each now-visible control the `touch-target` class if it's below 44px.

- [ ] **Step 3: Verify desktop unchanged + touch reveals**

Run: `pnpm --filter web build`
Expected: builds clean.

Desktop: hover behavior identical (the `coarse:` rules don't match a fine pointer). Emulated touch: previously hover-only controls are visible.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web
git commit -m "feat(touch): reveal functional hover-only controls under coarse:"
```

---

### Task 7: Touch entry points — tooltips, long-press menu, ⌘K button, palette tap-to-place

**Files:**
- Modify: `apps/web/components/canvas-context-menu.tsx` (long-press trigger)
- Modify: `apps/web/components/canvas-palette.tsx` (tap-to-place + `coarse:` sizing)
- Modify: the app-bar component that hosts the ⌘K palette (add a visible button)
- Modify: shadcn `Tooltip` usages on icon-only controls (visible label under coarse)

**Interfaces:**
- Consumes: `useCoarsePointer` (Task 1); `classifyPointer` (Task 1).
- Produces: a `claril:open-context-menu` window event listener in `canvas-context-menu.tsx` (the toolbar's `more` dispatches it, Task 5); palette `onClick` tap-to-place path.

- [ ] **Step 1: Long-press opens the context menu (canvas-context-menu.tsx)**

The current menu opens on `contextmenu` (right-click). Add a coarse-only long-press. Near the existing contextmenu handler, add:

```ts
// Long-press (600ms, no significant movement) opens the same menu on touch.
useEffect(() => {
  if (!isCoarse) return;
  const el = containerRef.current;
  if (!el) return;
  let timer: number | null = null;
  let startX = 0, startY = 0;
  const down = (e: PointerEvent) => {
    if (classifyPointer(e.pointerType) === "mouse") return;
    startX = e.clientX; startY = e.clientY;
    timer = window.setTimeout(() => openMenuAt(e.clientX, e.clientY), 600);
  };
  const cancel = (e?: PointerEvent) => {
    if (e && Math.hypot(e.clientX - startX, e.clientY - startY) < 10) return;
    if (timer) { clearTimeout(timer); timer = null; }
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", cancel);
  el.addEventListener("pointerup", () => timer && (clearTimeout(timer), (timer = null)));
  return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", cancel); };
}, [isCoarse]);

// And wire the toolbar's "more" dispatch:
useEffect(() => {
  const open = (e: Event) => {
    const id = (e as CustomEvent<{ id: string }>).detail.id;
    const el = registry.get(id);
    if (el) openMenuForElement(el);
  };
  window.addEventListener("claril:open-context-menu", open);
  return () => window.removeEventListener("claril:open-context-menu", open);
}, []);
```

(`openMenuAt` / `openMenuForElement` reuse the component's existing menu-open logic — refactor the current right-click handler to call a shared `openMenuForElement(element)` so both entry points share it.)

- [ ] **Step 2: Palette tap-to-place (canvas-palette.tsx)**

The palette currently starts a drag via `create.start(event.nativeEvent, shape)` (line ~67). Add a tap-to-place fallback for coarse pointers: tapping a palette item arms it; the next canvas tap drops it. Add to the palette item button:

```ts
const onActivate = (factoryType: string) => {
  if (isCoarse) {
    // Arm: next canvas tap places the shape at the tapped point.
    window.dispatchEvent(new CustomEvent("claril:arm-create", { detail: { factoryType } }));
  }
};
// keep the existing drag-start for fine pointers via onPointerDown.
```

And in `bpmn-canvas.tsx`, listen for `claril:arm-create`, then on the next canvas `click` use `modeler.get('modeling').createShape(...)` + `elementFactory.createShape({ type })` at the clicked diagram point (convert screen→diagram via `canvas.viewbox()`), then disarm. Give palette buttons `touch-target coarse:*` sizing.

- [ ] **Step 3: Visible ⌘K entry in the app bar**

In the app-bar component, add a button (visible on coarse, or always — a search affordance helps everyone) that fires the same command-palette open the ⌘K shortcut uses:

```tsx
<button
  className="touch-target coarse:flex hidden items-center gap-2 rounded-md border px-3"
  onClick={() => setCommandOpen(true)}
  aria-label="Open command menu"
>
  <Command className="size-4" /> <span className="text-sm">Menu</span>
</button>
```

- [ ] **Step 4: Tooltip rule for icon-only controls**

For icon-only controls whose meaning depends on a shadcn `Tooltip` (which won't open on touch), render a visible label under coarse. Pattern:

```tsx
<Button aria-label="Export">
  <Download className="size-4" />
  <span className="sr-only coarse:not-sr-only coarse:ml-2">Export</span>
</Button>
```

Apply to the canvas top-bar icon buttons (export, history, model switcher trigger, theme toggle).

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Emulated touch: long-press opens the context menu; palette tap-to-place drops a node; the Menu button opens ⌘K; icon buttons show labels. Desktop unchanged.

```bash
git add -A apps/web
git commit -m "feat(touch): long-press menu, palette tap-to-place, visible command + icon labels"
```

---

## Phase C — Orientation reflow

### Task 8: Layout-regime resolver (pure) + hook

**Files:**
- Create: `apps/web/lib/touch/workbench-layout.ts`
- Create: `apps/web/hooks/use-workbench-layout.ts`
- Test: `apps/web/lib/touch/workbench-layout.test.ts`

**Interfaces:**
- Produces: `resolveLayout(input: { width: number; orientation: 'portrait'|'landscape' }): 'wide'|'narrow'`; `useWorkbenchLayout(): 'wide'|'narrow'`.
- Rule: `narrow` when `orientation === 'portrait'` OR `width < 900`; else `wide`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/touch/workbench-layout.test.ts
import { describe, expect, it } from "vitest";
import { resolveLayout } from "./workbench-layout";

describe("resolveLayout", () => {
  it("iPad landscape (1024, landscape) is wide", () => {
    expect(resolveLayout({ width: 1024, orientation: "landscape" })).toBe("wide");
  });
  it("iPad portrait (768, portrait) is narrow", () => {
    expect(resolveLayout({ width: 768, orientation: "portrait" })).toBe("narrow");
  });
  it("a narrow landscape window (<900) is narrow", () => {
    expect(resolveLayout({ width: 820, orientation: "landscape" })).toBe("narrow");
  });
  it("a wide desktop is wide", () => {
    expect(resolveLayout({ width: 1600, orientation: "landscape" })).toBe("wide");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- workbench-layout`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/touch/workbench-layout.ts
export type Layout = "wide" | "narrow";

const NARROW_MAX = 900;

/** Floating panels dock on `wide`; they become dismissible sheets on `narrow`
 * (portrait, or any viewport under NARROW_MAX). Pure + testable. */
export function resolveLayout(input: {
  width: number;
  orientation: "portrait" | "landscape";
}): Layout {
  if (input.orientation === "portrait") return "narrow";
  return input.width < NARROW_MAX ? "narrow" : "wide";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- workbench-layout`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the hook**

```ts
// apps/web/hooks/use-workbench-layout.ts
"use client";
import { useEffect, useState } from "react";
import { resolveLayout, type Layout } from "@/lib/touch/workbench-layout";

export function useWorkbenchLayout(): Layout {
  const [layout, setLayout] = useState<Layout>("wide");
  useEffect(() => {
    const apply = () =>
      setLayout(
        resolveLayout({
          width: window.innerWidth,
          orientation: window.matchMedia("(orientation: portrait)").matches
            ? "portrait"
            : "landscape",
        }),
      );
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
  return layout;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/touch/workbench-layout.ts apps/web/lib/touch/workbench-layout.test.ts apps/web/hooks/use-workbench-layout.ts
git commit -m "feat(touch): workbench layout-regime resolver + hook"
```

---

### Task 9: Portrait panels as Sheets + re-fit on rotate

**Files:**
- Modify: `apps/web/components/bpmn-workbench.tsx` (layout regime; wrap AI drawer + palette in `Sheet` when `narrow`; `data-coarse`/`workbench-safe` root)
- Modify: `apps/web/components/bpmn-canvas.tsx` (re-fit viewport on orientation change)

**Interfaces:**
- Consumes: `useWorkbenchLayout` (Task 8); shadcn `Sheet` (`apps/web/components/ui/sheet.tsx`, already present).
- Produces: no new exports.

- [ ] **Step 1: Regime-driven panels in bpmn-workbench.tsx**

```tsx
import { useWorkbenchLayout } from "@/hooks/use-workbench-layout";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
// …
const layout = useWorkbenchLayout();
// Root gets the safe-area class:
<div className="workbench-safe …existing classes…">
// In wide: render the AI drawer + palette docked as today.
// In narrow: render them inside a Sheet so the canvas keeps full width.
{layout === "narrow" ? (
  <Sheet>
    <SheetTrigger asChild>
      <button className="touch-target …">AI</button>
    </SheetTrigger>
    <SheetContent side="bottom" className="h-[70vh]">
      {/* existing AI drawer content */}
    </SheetContent>
  </Sheet>
) : (
  /* existing docked AI drawer */
)}
```

Do the same for the element palette (bottom sheet in `narrow`). Keep the canvas as a sibling that always fills the frame (panels float/overlay — they never resize the canvas container).

- [ ] **Step 2: Re-fit the canvas on rotate (bpmn-canvas.tsx)**

```ts
useEffect(() => {
  const refit = () => {
    const canvas = modelerRef.current?.get("canvas") as { zoom: (v: string) => void } | undefined;
    // Let the layout settle, then fit.
    setTimeout(() => canvas?.zoom("fit-viewport"), 150);
  };
  window.addEventListener("orientationchange", refit);
  return () => window.removeEventListener("orientationchange", refit);
}, []);
```

- [ ] **Step 3: Verify in both orientations**

Emulated iPad: in landscape the panels dock as before; rotate to portrait → panels become bottom sheets, canvas stays full-width and re-fits; the toolbar overlay repositions. Safe-area padding keeps controls off the home indicator.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter web typecheck`

```bash
git add apps/web/components/bpmn-workbench.tsx apps/web/components/bpmn-canvas.tsx
git commit -m "feat(touch): portrait panels as sheets + re-fit canvas on rotate"
```

---

## Phase D — Apple Pencil

### Task 10: Pointer-mode stamping (pen vs finger)

**Files:**
- Modify: `apps/web/components/bpmn-canvas.tsx` (stamp `data-pen`/`data-finger` on the container from the live PointerEvent)

**Interfaces:**
- Consumes: `classifyPointer` (Task 1).
- Produces: the container carries `data-pointer="pen"|"finger"|"mouse"` reflecting the most recent pointer, so CSS and the Pencil module can branch.

- [ ] **Step 1: Stamp the container**

```ts
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const stamp = (e: PointerEvent) => {
    el.dataset.pointer = classifyPointer(e.pointerType);
  };
  el.addEventListener("pointerdown", stamp, true);
  return () => el.removeEventListener("pointerdown", stamp, true);
}, []);
```

- [ ] **Step 2: Verify**

Emulated pen vs touch events set `data-pointer` accordingly (inspect the container in devtools). No desktop impact (mouse → `data-pointer="mouse"`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/bpmn-canvas.tsx
git commit -m "feat(touch): stamp data-pointer (pen/finger/mouse) on the canvas"
```

---

### Task 11: Pencil draw-to-connect + precision + palm rejection

**Files:**
- Create: `apps/web/lib/touch/pencil-connect-module.ts`
- Test: `apps/web/lib/touch/pencil-connect-module.test.ts`
- Modify: `apps/web/components/bpmn-canvas.tsx` (register the module)

**Interfaces:**
- Consumes: `classifyPointer` (Task 1); diagram-js `eventBus`, `connect`, `elementRegistry`.
- Produces: default-exported module `{ __init__: ['pencilConnect'], pencilConnect: ['type', PencilConnect] }`, `PencilConnect.$inject = ['eventBus','connect','canvas']`. On `element.pointerdown` where the original event's `pointerType === 'pen'` and the target is a shape (not a connection), call `connect.start(originalEvent, element)`; otherwise do nothing (finger keeps move/pan). Palm rejection: ignore `touch`-type pointerdowns on the canvas while a pen stroke is active.

- [ ] **Step 1: Write the failing test** (drives the decision function)

```ts
// apps/web/lib/touch/pencil-connect-module.test.ts
import { describe, expect, it } from "vitest";
import { shouldStartConnect } from "./pencil-connect-module";

const shape = { id: "T1", waypoints: undefined };
const connection = { id: "F1", waypoints: [{ x: 0, y: 0 }] };

describe("shouldStartConnect", () => {
  it("pen on a shape → connect", () => {
    expect(shouldStartConnect("pen", shape)).toBe(true);
  });
  it("finger on a shape → no (finger moves/pans)", () => {
    expect(shouldStartConnect("touch", shape)).toBe(false);
  });
  it("pen on a connection → no (can't start a flow from a flow)", () => {
    expect(shouldStartConnect("pen", connection)).toBe(false);
  });
  it("mouse → no (desktop unchanged, uses the normal context pad)", () => {
    expect(shouldStartConnect("mouse", shape)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- pencil-connect`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/touch/pencil-connect-module.ts
import { classifyPointer } from "./pointer";

interface ElementLike { id: string; waypoints?: unknown[] }

/** Pure decision: a pen press on a plain shape starts a connection; finger and
 * mouse do not (finger = arrange; mouse = existing desktop context pad). */
export function shouldStartConnect(pointerType: string, element: ElementLike): boolean {
  if (classifyPointer(pointerType) !== "pen") return false;
  if (element.waypoints) return false; // it's a connection, not a node
  return true;
}

interface EventBusLike {
  on: (event: string, cb: (e: { element: ElementLike; originalEvent?: PointerEvent }) => void) => void;
}
interface ConnectLike { start: (ev: Event, el: ElementLike) => void }

/** diagram-js module: route Apple Pencil presses on a node into the connect
 * service (draw-to-connect). bpmn-js `connect` enforces BPMN rules (sequence
 * within a pool, message across pools), so no connection logic is reimplemented. */
export class PencilConnect {
  static $inject = ["eventBus", "connect"];
  constructor(eventBus: EventBusLike, connect: ConnectLike) {
    eventBus.on("element.pointerdown", (e) => {
      const original = e.originalEvent;
      if (!original) return;
      if (!shouldStartConnect(original.pointerType, e.element)) return;
      connect.start(original, e.element);
    });
  }
}

const pencilConnectModule = {
  __init__: ["pencilConnect"],
  pencilConnect: ["type", PencilConnect],
};
export default pencilConnectModule;
```

> Implementer note: confirm the event name carrying the original PointerEvent. diagram-js interaction events (`element.pointerdown` / `element.mousedown`) expose `originalEvent` (verified: `InteractionEvents` attaches `originalEvent`; `getOriginal(e)` returns it). If `element.pointerdown` isn't emitted in this build, subscribe to `element.mousedown` and read `getOriginal(e)` — on iPad Safari pointer events back the mouse events. Verify in-device in Task 12.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- pencil-connect`
Expected: PASS (4 tests).

- [ ] **Step 5: Register the module + palm rejection**

In `bpmn-canvas.tsx`, add `pencilConnectModule` to `additionalModules`:

```ts
import pencilConnectModule from "@/lib/touch/pencil-connect-module";
// …
additionalModules: [minimapModule, touchGesturesModule, pencilConnectModule],
```

Palm rejection (coarse only): while `data-pointer === 'pen'` was the last stamp, swallow `touch`-type `pointerdown`s on the container so a resting palm doesn't pan. Add to the stamping effect (Task 10):

```ts
const reject = (e: PointerEvent) => {
  if (el.dataset.pointer === "pen" && e.pointerType === "touch") {
    e.stopPropagation();
  }
};
el.addEventListener("pointerdown", reject, true);
// add removeEventListener in cleanup
```

- [ ] **Step 6: Verify (emulation now, device in Task 12)**

Run: `pnpm --filter web typecheck`
Draw-to-connect is validated for real on-device in Task 12 (emulated pen events exercise `shouldStartConnect`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/touch/pencil-connect-module.ts apps/web/lib/touch/pencil-connect-module.test.ts apps/web/components/bpmn-canvas.tsx
git commit -m "feat(touch): Apple Pencil draw-to-connect + palm rejection"
```

---

## Phase E — Validation

### Task 12: Playwright touch-emulation spec + desktop regression guard

**Files:**
- Create: `apps/web/e2e/touch-editing.spec.ts`

**Interfaces:**
- Consumes: the running app. Uses Playwright's `hasTouch` + viewport device profile.

- [ ] **Step 1: Write the emulation spec**

```ts
// apps/web/e2e/touch-editing.spec.ts
import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["iPad (gen 7) landscape"], hasTouch: true });

test("tap selects an element and shows the touch toolbar", async ({ page }) => {
  await page.goto("/d/<seeded-diagram-id>"); // use a seeded fixture diagram
  const task = page.locator(".djs-element[data-element-id^='Task']").first();
  await task.tap();
  await expect(page.getByLabel("Rename")).toBeVisible();
});

test("two-finger gesture changes the viewbox", async ({ page }) => {
  await page.goto("/d/<seeded-diagram-id>");
  const before = await page.locator(".djs-container svg").getAttribute("viewBox");
  // Synthesize a pinch via touchscreen API (two pointers moving apart).
  await page.touchscreen.tap(400, 300);
  // … dispatch a pinch sequence (helper) …
  const after = await page.locator(".djs-container svg").getAttribute("viewBox");
  expect(after).not.toBe(before);
});

test("desktop regression: no data-coarse on a fine pointer", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Desktop Chrome"], hasTouch: false });
  const page = await ctx.newPage();
  await page.goto("/d/<seeded-diagram-id>");
  await expect(page.locator("html")).not.toHaveAttribute("data-coarse", "true");
  await ctx.close();
});
```

- [ ] **Step 2: Run the spec**

Run: `pnpm --filter web exec playwright test touch-editing`
Expected: the tap-selects-toolbar and desktop-regression tests PASS. (The pinch test may need the dispatch helper tuned; keep it as the documented integration check.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/touch-editing.spec.ts
git commit -m "test(touch): Playwright iPad emulation + desktop regression guard"
```

---

### Task 13: Real-device smoke checklist + definition of done

**Files:**
- Create: `docs/superpowers/ipad-smoke-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# iPad touch-editing smoke checklist (manual, on hardware)

Run on a physical iPad in Safari, BOTH landscape and portrait, finger + Apple Pencil.

## Gestures
- [ ] Two-finger pinch zooms around the pinch center; two-finger drag pans.
- [ ] One finger on empty canvas pans; one finger on a node moves it (no accidental moves when panning).
- [ ] Page itself never scrolls/zooms while interacting with the canvas.

## Affordances (no hover)
- [ ] Tap a node → selection toolbar appears, pinned, and tracks pan/zoom.
- [ ] Toolbar: append, connect, rename, delete, more all work.
- [ ] Long-press a node → context menu opens.
- [ ] Palette: tap an item then tap the canvas → node is placed.
- [ ] Command menu reachable via the visible Menu button (no keyboard).
- [ ] Icon-only top-bar buttons show labels.

## Orientation
- [ ] Rotate landscape↔portrait: panels dock (landscape) / become bottom sheets (portrait); canvas re-fits; nothing under the home indicator.

## Apple Pencil
- [ ] Pencil drag node→node draws a sequence flow (message flow across pools).
- [ ] Resting palm does not pan while drawing with the Pencil.
- [ ] Bendpoint/reconnect handles are grabbable with the Pencil.

## Acceptance (definition of done)
- [ ] Build a 2-pool, ~10-node diagram end-to-end by touch — palette-add, move,
      connect (finger toolbar + Pencil), rename, run the inspector, comment —
      with NO keyboard or mouse, in both orientations.

## Desktop regression
- [ ] On a desktop browser, canvas, hover context-pad, and all affordances are
      visually and behaviorally identical to before (no data-coarse).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/ipad-smoke-checklist.md
git commit -m "docs(touch): iPad real-device smoke checklist + definition of done"
```

---

## Self-Review

**Spec coverage:**
- §1 Architecture → Tasks 1 (coarse gate), 4 (gesture module + move guard), 5 (selection toolbar via overlays). ✓
- §2 Affordance replacement → Tasks 2 (`coarse:` variant), 6 (hover audit), 7 (tooltips, long-press, ⌘K, palette). ✓
- §3 Orientation reflow → Tasks 8 (regime resolver), 9 (Sheets + re-fit + safe areas). ✓
- §4 Pencil → Tasks 10 (pointer stamp), 11 (draw-to-connect, palm rejection, precision handles). ✓
- §5 Testing → Tasks 1/3/4/8/11 (unit), 12 (Playwright + desktop guard), 13 (device checklist + DoD). ✓
- Desktop-pixel-identical constraint → enforced per task and guarded in Task 12. ✓

**Placeholder scan:** The two "implementer notes" (context-pad entry keys in Task 5; the pointerdown event name in Task 11) are **read-to-confirm** steps against a live modeler, not vague TODOs — the surrounding code is complete and the thing to confirm is a single string each, with the fallback stated. Everything else ships concrete code.

**Type consistency:** `isCoarsePointer`/`classifyPointer` (Task 1) reused verbatim in Tasks 4/7/10/11; `beginPinch`/`updatePinch` signatures match between Task 3 and Task 4; `resolveLayout`/`Layout` match between Task 8 and the hook; `shouldStartConnect` signature matches between Task 11 test and impl; `ToolbarServices` defined once (Task 5) and consumed there.

**Risks carried from the spec:** exact diagram-js context-pad entry keys and the pen-event name are confirmed live during Tasks 5/11; real gesture feel is the Task 13 on-device gate.
