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

## Deferred — automated touch-emulation
A Playwright headless iPad touch-emulation spec (tap-select, long-press menu, two-finger viewbox change, draw-to-connect) was planned but deferred: this repo has no Playwright set up (no `@playwright/test`, no config), and adding it (plus Chromium binaries) is a separate infra decision. The deterministic `data-coarse`/inertness guarantees are covered by the vitest guard `apps/web/lib/touch/desktop-regression.test.ts`; true multi-touch feel is validated by the manual checklist above.
