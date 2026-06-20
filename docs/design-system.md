# Design System

**Aesthetic:** Linear/Vercel minimal, **dark-first**. Calm, precise, content-first. The diagram is the hero; chrome recedes.

## Principles
1. Canvas is the hero — chrome recedes, panels are summoned not permanent.
2. Progressive disclosure — show the few relevant controls, not 40-field forms.
3. Keyboard-first + ⌘K command palette — every action two keystrokes away.
4. Color means something (severity, status, presence), never decoration.
5. Motion with purpose — 150–200ms, spring on drag; respect `prefers-reduced-motion`.
6. Dark mode + density first-class. (Light mode is a later phase; tokens are CSS variables so it's swappable.)

## Tokens
```
SURFACES
  canvas      #0B0B0D     full-bleed, slightly off the panels
  panel       #18181B/85% + backdrop-blur (frosted glass over canvas)
  elevated    #1F1F23
  hairline    rgba(255,255,255,.08)        borders, not shadows

TEXT  primary #FAFAFA  ·  secondary #A1A1AA  ·  muted #71717A

ACCENT (single, meaningful)  electric blue  #4D8DFF
  selection rings, primary actions, AI affordances

SEMANTIC (meaning only)  error #F87171 · warn #FBBF24 · info #60A5FA · success #34D399

SHAPE  radius 6px controls / 10px panels ·  depth from blur + 1px hairline (not drop shadows)
TYPE   Geist (UI) · JetBrains Mono (IDs/XML) · tight tracking
MOTION 150–200ms · Framer Motion · reduced-motion aware
```

## Layout: canvas-maximal / floating
- Full-bleed canvas; frosted-glass panels float, dock, snap, remember position.
- Slim vertical **palette** (custom shadcn component, left).
- Centered bottom **command bar**: ⌘K (cmdk) + AI entry — the most-used surface.
- **Inspector / Properties / AI** as floating cards (right), collapse to pills when idle.
- **Minimap** bottom-right with a finding heatmap.

## Theming the bpmn-js canvas (the differentiator)
shadcn/Tailwind do NOT touch the SVG canvas — theme it explicitly so the diagram looks designed:
- Dark canvas + subtle dot-grid `rgba(255,255,255,.04)`.
- Tasks: fill `#18181B`, 1px `#3F3F46` border, 8px corners, zinc-100 labels. Crisp events/gateways. Flows zinc strokes.
- Selection: electric blue ring + soft glow (replace default handles). Hover: faint accent halo.
- Drive canvas colors from **shared CSS variables** so dark mode + accent flow into the SVG.

## Finding visualization
Severity ring + pulse + badge pinned to the offending element; clicking a finding flies the camera to it; minimap heatmap shows problem density.

## Components (shadcn/ui)
Command, Popover, Tooltip, Dialog, Sheet, Tabs, ScrollArea, Resizable, ContextMenu, DropdownMenu, Toggle, Badge, Button, Input, Select, Separator, Avatar. Radix → accessibility (focus/keyboard/ARIA) is free; don't regress it.
