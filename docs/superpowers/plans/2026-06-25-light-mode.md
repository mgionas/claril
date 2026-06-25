# Light Mode Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use `- [ ]` checkboxes.
> NOTE: per the user, this work is **not to be committed to git** yet — keep
> changes local until they say otherwise.

**Goal:** Add a light theme across the whole app (chrome **and** the bpmn-js
canvas), following the OS preference by default with a manual, persisted toggle
and no flash on load.

**Decisions (locked):** full light canvas · follow-system + manual override ·
toggle in the workbench top bar **and** Settings.

**Architecture:** `next-themes` drives a `class="dark"|"light"` on `<html>`.
The design tokens (`--color-*`) become **theme-aware**: their literal values move
out of the static `@theme` block into `:root`/`.dark` overrides, surfaced to
Tailwind via `@theme inline`. shadcn bridge vars already reference `--color-*`,
so they flip for free. The bpmn-js canvas's hardcoded dark hex is re-pointed at
the same tokens (+ two new canvas tokens) so the diagram flips too.

**Tech stack:** Next.js 16 App Router, Tailwind v4 (`@theme` / `@theme inline`),
shadcn/ui, `next-themes`, bpmn-js.

---

## File structure

- Modify: `apps/web/package.json` — add `next-themes`
- Modify: `apps/web/app/layout.tsx` — drop hardcoded `dark` class; mount provider; `suppressHydrationWarning`
- Create: `apps/web/components/theme-provider.tsx` — `next-themes` wrapper (client)
- Create: `apps/web/components/theme-toggle.tsx` — sun/moon toggle (client)
- Modify: `apps/web/app/globals.css` — token light/dark split + canvas re-tokenizing + `color-scheme`
- Modify: top-bar component(s) that render the workbench header — mount `<ThemeToggle/>`
- Modify: `apps/web/app/settings/profile/page.tsx` (or the appearance/settings surface) — theme row
- Modify: `apps/web/app/layout.tsx` NextTopLoader color → token-driven (optional)

---

### Task 1: Add `next-themes` + provider (no flash)

**Files:** `apps/web/package.json`, `apps/web/components/theme-provider.tsx`, `apps/web/app/layout.tsx`

- [ ] **Step 1:** `pnpm --filter web add next-themes` (latest).
- [ ] **Step 2:** Create `theme-provider.tsx`:

```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
```

- [ ] **Step 3:** In `layout.tsx`, remove the hardcoded `className="dark"` on
  `<html>`, add `suppressHydrationWarning`, and wrap `{children}` in the provider:

```tsx
<html lang="en" suppressHydrationWarning>
  <body className="bg-canvas text-fg antialiased">
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NextTopLoader … />
      {children}
      <Analytics />
    </ThemeProvider>
  </body>
</html>
```

  (`attribute="class"` → next-themes sets `class="dark"`/`"light"` on `<html>`;
  `enableSystem` + `defaultTheme="system"` follows the OS; the inline script it
  injects prevents flash.)

- [ ] **Step 4:** `pnpm --filter web typecheck` passes.

---

### Task 2: Make design tokens theme-aware

**Files:** `apps/web/app/globals.css`

Currently `@theme { --color-canvas: #0b0b0d; … }` bakes the dark values in
statically. Convert to a switchable model.

- [ ] **Step 1:** Replace the literal `@theme { … }` color block with an
  `@theme inline` block that points each token at an intermediate var, then set
  those intermediates per scope:

```css
@theme inline {
  --color-canvas: var(--c-canvas);
  --color-panel: var(--c-panel);
  --color-elevated: var(--c-elevated);
  --color-hairline: var(--c-hairline);
  --color-fg: var(--c-fg);
  --color-fg-muted: var(--c-fg-muted);
  --color-fg-subtle: var(--c-fg-subtle);
  --color-accent: var(--c-accent);
  --color-error: var(--c-error);
  --color-warning: var(--c-warning);
  --color-info: var(--c-info);
  --color-success: var(--c-success);
  --color-ai-edit: var(--c-ai-edit);
  --color-comment: var(--c-comment);
  /* new canvas-only tokens */
  --color-canvas-stroke: var(--c-canvas-stroke);
  --color-canvas-grid: var(--c-canvas-grid);
}

/* DARK (default look) */
:root, .dark {
  color-scheme: dark;
  --c-canvas: #0b0b0d;
  --c-panel: #18181b;
  --c-elevated: #1f1f23;
  --c-hairline: rgba(255, 255, 255, 0.08);
  --c-fg: #fafafa;
  --c-fg-muted: #a1a1aa;
  --c-fg-subtle: #71717a;
  --c-accent: #4d8dff;
  --c-error: #f87171;
  --c-warning: #fbbf24;
  --c-info: #60a5fa;
  --c-success: #34d399;
  --c-ai-edit: #a78bfa;
  --c-comment: #f59e0b;
  --c-canvas-stroke: #3f3f46;
  --c-canvas-grid: rgba(255, 255, 255, 0.04);
}

/* LIGHT */
.light {
  color-scheme: light;
  --c-canvas: #ffffff;
  --c-panel: #f7f7f8;
  --c-elevated: #efeff1;
  --c-hairline: rgba(0, 0, 0, 0.10);
  --c-fg: #18181b;
  --c-fg-muted: #52525b;
  --c-fg-subtle: #71717a;
  --c-accent: #2563eb;        /* slightly deeper blue for contrast on white */
  --c-error: #dc2626;
  --c-warning: #d97706;
  --c-info: #2563eb;
  --c-success: #059669;
  --c-ai-edit: #7c3aed;
  --c-comment: #d97706;
  --c-canvas-stroke: #d4d4d8;
  --c-canvas-grid: rgba(0, 0, 0, 0.05);
}
```

  Keep `:root, .dark` together so dark is the default before next-themes
  resolves (avoids a light flash for dark-preferring users / SSR).

- [ ] **Step 2:** Remove the old standalone `:root { color-scheme: dark }` and
  the literal `@theme {…}` color list (now superseded). Leave the shadcn bridge
  `:root { --background: var(--color-canvas); … }` and its `@theme inline` block
  unchanged — they reference `--color-*` and flip automatically.
- [ ] **Step 3:** `pnpm --filter web build` passes; manually load the app — dark
  looks identical to before.

---

### Task 3: Re-tokenize the bpmn-js canvas

**Files:** `apps/web/app/globals.css` (the `.djs-*` rules)

Replace the hardcoded dark hex with the now-theme-aware tokens so the canvas
flips. Exact replacements:

- [ ] `.djs-container` dot-grid: `radial-gradient(rgba(255,255,255,0.04) …)` →
  `radial-gradient(var(--color-canvas-grid) 1px, transparent 1px)`.
- [ ] `.djs-element .djs-visual > …, .djs-dragger .djs-visual …`:
  `stroke: #3f3f46` → `var(--color-canvas-stroke)`; `fill: #18181b` →
  `var(--color-panel)`.
- [ ] hover/connect/drop fill `#18181b` → `var(--color-panel)`.
- [ ] connection `stroke: #71717a` and `path[marker-end] fill: #71717a` →
  `var(--color-fg-subtle)`.
- [ ] labels `.djs-label, .djs-visual text { fill: #fafafa }` →
  `var(--color-fg)`.
- [ ] rename/tooltip frosted literals `rgba(24,24,27,0.97)` →
  `color-mix(in srgb, var(--color-panel) 97%, transparent)`.
- [ ] popup box-shadow black `rgba(0,0,0,0.6)` is fine in both themes (keep), but
  drop the second layer to `0 0 0 1px var(--color-hairline)` (already a token).
- [ ] Selection/hover outline, finding markers, diff/ai-edit/comment markers,
  drag/drop `--shape-drop-*` overrides already use `var(--color-*)` — leave them;
  they flip automatically. (Verify the drop tints read well on white.)
- [ ] Minimap (`diagram-js-minimap`): add a rule so its viewport/background use
  `var(--color-panel)`/`var(--color-hairline)` instead of its default white.
- [ ] **Verify:** load a diagram in light mode — shapes, labels, edges, grid,
  selection, popups, drag/drop, and finding markers all read correctly.

---

### Task 4: Theme toggle UI

**Files:** `apps/web/components/theme-toggle.tsx`, the workbench top-bar component, Settings page

- [ ] **Step 1:** Create `theme-toggle.tsx` — a button using `useTheme()` from
  `next-themes`; cycles light/dark (and optionally "system"); `Sun`/`Moon` from
  lucide; guard against hydration mismatch with a `mounted` check so it renders a
  neutral placeholder until mounted.
- [ ] **Step 2:** Mount `<ThemeToggle/>` in the workbench top bar next to the
  Export/Settings buttons (the header rendered around `bpmn-workbench.tsx`'s top
  bar).
- [ ] **Step 3:** Add a theme row on the Settings/Profile page (segmented
  Light / Dark / System control bound to `setTheme`).
- [ ] **Step 4:** `pnpm --filter web typecheck`; verify the toggle flips the app
  live and the choice persists across reloads.

---

### Task 5: Audit & fix remaining hardcoded colors

**Files:** sweep `apps/web/components/**`, `apps/web/app/**`

- [ ] **Step 1:** Grep for theme-breaking literals: `bg-white`, `text-black`,
  `text-white`, `bg-black`, `#fff`, `#000`, `rgba(255,255,255`, `rgba(0,0,0`,
  and any `dark:` utilities (there should be none — app is token-based). Replace
  with token utilities (`bg-canvas`, `text-fg`, `border-hairline`, …).
- [ ] **Step 2:** Check `NextTopLoader color` (`#4d8dff`) — fine on both, or set
  from `--color-accent`. Check marketing pages (`components/marketing/*`) — they
  may assume dark; ensure they use tokens or pin the marketing site to dark if
  out of scope (decide: marketing can stay dark-only for now).
- [ ] **Step 3:** Check export (PNG/PDF via `diagram-export.ts` / `cropSvgToContent`):
  exported SVG should use a **white** background in light mode (or always white
  for print regardless of theme — pick always-white so exports are print-safe).
- [ ] **Step 4:** Charts (recharts) read `--color-chart-*` → flip automatically;
  spot-check contrast on white.

---

### Task 6: Verify in both themes

- [ ] `pnpm --filter web typecheck` + `build` pass.
- [ ] Live (light + dark): dashboard, projects, settings, a BPMN diagram
  (shapes/labels/edges/grid/selection), the replace popup, rename box, error
  tooltip, drag/drop (no white flash in dark; readable in light), Problems/Chat
  drawer, comments, export PNG/PDF (white bg), ⌘K modal.
- [ ] Confirm: no flash of wrong theme on hard reload; system-preference change
  is picked up; manual choice persists.

---

## Notes / risks
- **Tailwind v4 specificity:** moving values into `:root, .dark` / `.light` and
  surfacing via `@theme inline` is the supported v4 theming pattern; the static
  `@theme` color block must be removed or it would shadow the switch.
- **Canvas tokens leak via diagram-js:** the earlier `--shape-drop-*` overrides
  on `.djs-parent.djs-parent` already use tokens — re-verify the light tints.
- **Marketing site** can stay dark-only initially (out of app scope) — flag if
  the user wants it themed too.
- **No git commits** until the user approves.
