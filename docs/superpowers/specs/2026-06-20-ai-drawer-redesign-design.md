# AI Drawer Redesign — Design Spec

**Date:** 2026-06-20
**Status:** Approved (design) — pending spec review
**Scope:** Single subsystem — the AI/Inspector drawer UX in `apps/web`.

## Goal

Rebuild the right-hand drawer so it fits Claril's design system and becomes a real
conversational AI surface: a tabbed drawer (**Chat** + **Problems**), streamed
"thinking / analyzing / drawing" responses, sent/received chat bubbles, specialized
edit-proposal cards, the deterministic findings as their own tab with per-problem
"Ask AI", a markdown documentation viewer with on-demand **Regenerate**, and
per-diagram persistence of generated docs. The standalone Q&A feature is removed and
folded into Chat.

## Background — what exists today

- **Drawer**: bespoke Tailwind push-panels (`inspector-panel.tsx`, `assistant-panel.tsx`)
  that shrink the canvas. The workbench swaps Inspector ↔ Assistant by `aiConnected`
  (`bpmn-workbench.tsx`).
- **Chat**: findings list + a single AI text blob (`aiMessage`, `whitespace-pre-wrap`,
  no bubbles) + `change-plan-card.tsx` (a mono op-list with Apply/Discard).
- **Q&A**: a separate card inside the Inspector, driven by `runAdvisorQuestion` →
  `packages/ai-advisor/src/qa.ts` (one-shot `generateText`).
- **Docs**: `doc-panel.tsx` renders raw markdown in a `<pre>` (no markdown renderer
  dependency exists anywhere). It regenerates on every open and is never persisted.
- **AI**: every call is one-shot `generateText` / `generateObject`. No streaming.
- **Design system**: Tailwind v4 `@theme` tokens in `app/globals.css` + a shadcn var
  bridge; shadcn primitives in `components/ui/` (button, input, label, select, dialog,
  badge, popover, command). No `tabs`, `scroll-area`, or `tooltip` yet.

## Approved decisions

1. **Streaming model = hybrid.** Stream prose answers token-by-token; run structured
   edit-plans via a server-side tool, surfaced with phase pills. (Not phase-only,
   not full structured streaming.)
2. **Drawer tabs = Chat + Problems.** Docs stays a separate slide-over (upgraded).
   When AI is not connected, only the Problems tab renders.
3. **Docs persisted in DB**, per-diagram, instant open + Regenerate.
4. **Regenerate scope = docs only.** Diagram generation stays one-shot at create time.
5. **Markdown renderer = `streamdown`** (Vercel, streaming-aware, Tailwind-native) —
   used for both streamed chat prose and the Docs viewer.
6. **Chat history is session-scoped** (client state) in this slice. Durable per-diagram
   chat persistence is an explicit follow-up, out of scope (YAGNI).

## Architecture

### Drawer shell

`ai-drawer.tsx` replaces the Inspector/Assistant swap. It keeps the existing
push-panel behavior (shrinks the canvas via the `open` width transition) and owns the
active tab. It renders shadcn `Tabs`:

- **AI connected** → two tabs: `Chat` and `Problems`.
- **AI not connected** → no tab strip; renders only the Problems view (today's
  Inspector behavior), and all "Ask AI" affordances are hidden.

The drawer header keeps the Sparkles/title treatment and the error/warning count
badges (badges live on the Problems tab trigger).

### Streaming chat (the core change)

A new route handler **`apps/web/app/api/ai/chat/route.ts`**:

- Resolves the org BYOK config server-side via the existing AI-context resolver
  (`resolveAiContext` / `lib/ai.ts`). The decrypted key never reaches the client.
- Calls AI SDK `streamText({ model, system, messages, tools })` and returns
  `toUIMessageStreamResponse()`.
- Grounds the system prompt on the current `ProcessGraph` + findings (+ asset context)
  using the existing `describeGrounding`, exactly as `qa.ts` does today. The current
  graph/findings are sent from the client with each request (the client already holds
  them) so the server stays stateless.
- Exposes one tool, **`proposeEdit`**, whose `execute` calls the existing
  `planEdits(input, config)` (`packages/ai-advisor/src/planner.ts`) and returns the
  validated `EditPlan`. The model calls this tool when the user's message is an editing
  instruction; otherwise it answers in prose.

The client uses AI SDK React **`useChat`** pointed at `/api/ai/chat`. Two render paths
in one transcript:

- **Prose turns** → streamed token-by-token into a received bubble via `streamdown`.
- **Editing turns** → while the `proposeEdit` tool runs, a **phase pill** shows
  `● Drawing N ops…`; on tool result, a **proposal card** renders the `EditPlan`.
  Apply/Discard drive the existing client-side `applyEditPlan` + `showDiff`/`clearDiff`
  on the canvas (`bpmn-canvas.tsx` `CanvasApi`), unchanged.

**Phase pills** (`Analyzing → Planning → Drawing → Done`) are derived from real
`useChat` stream + tool lifecycle events (message start, tool-call start, tool-result,
finish) — not faked timers.

**Tool-support fallback.** If the configured model does not support tool calling, the
route catches the capability error and the client falls back to the existing
`runDiagramEdit` server action, rendering the same proposal card. Behavior is identical
from the user's perspective; only the transport differs.

This route **replaces** `runAdvisorQuestion` and the `aiMessage` blob in the workbench.
The deterministic advisor critique (`runAdvisor`) and quick-fixes are unchanged.

### Problems tab + Ask AI

`problems-tab.tsx` is the findings list extracted from today's `inspector-panel.tsx`
(severity dots, message, quick-fix hint, rule id / "✦ AI advisor", focus/select on
click, the **Fix** button for findings with a `.fix`). It adds, when `aiConnected`,
an **Ask AI** button per finding that:

1. composes a chat message such as `Help me resolve: "<finding.message>" (rule <ruleId>, element <elementId>)`,
2. switches the drawer to the **Chat** tab,
3. submits it through `useChat` so the streamed response (and any `proposeEdit`) flows
   into the transcript.

### Docs viewer + persistence + regenerate

`doc-panel.tsx` is upgraded:

- Renders markdown with `streamdown` (replacing the `<pre>`), keeping Copy + Download.
- Adds a **Regenerate** button.
- On open, loads persisted markdown (instant); only generates if none exists.

A new server action path persists docs: `runDocGen` writes the markdown to a new
**`diagram_doc`** table after generating; a read action loads it; Regenerate overwrites.

## Data model

New table in `packages/db/src/schema/app.ts` (generate-only migration; applying to Neon
requires explicit user authorization):

```
diagram_doc
  diagram_id   text  PK, FK → diagram.id (1:1, on delete cascade)
  markdown     text  not null
  model        text  -- concrete model id used to generate
  generated_at timestamptz not null default now()
```

Helpers: `getDiagramDoc(diagramId)` and `upsertDiagramDoc(diagramId, markdown, model)`.

## Components & files

- **Create** `apps/web/components/ai-drawer.tsx` — tabbed shell, owns active tab,
  shrink behavior, gating by `aiConnected`.
- **Create** `apps/web/components/chat-tab.tsx` — `useChat` transcript + composer.
- **Create** `apps/web/components/chat-bubble.tsx` — sent/received bubble; received uses
  `streamdown`.
- **Create** `apps/web/components/proposal-card.tsx` — replaces `change-plan-card.tsx`;
  grouped ops with icons (＋added / →connected / ✎updated / ✕deleted), affected-element
  chips, Apply/Discard, "Applied + Undo" state.
- **Create** `apps/web/components/problems-tab.tsx` — findings list + Fix + Ask AI.
- **Create** `apps/web/app/api/ai/chat/route.ts` — streaming chat route with `proposeEdit`.
- **Add** shadcn `tabs`, `scroll-area`, `tooltip` to `components/ui/`.
- **Add** dependency `streamdown` to `apps/web/package.json`.
- **Modify** `apps/web/components/bpmn-workbench.tsx` — render `ai-drawer.tsx`; remove
  the Inspector/Assistant swap, the `aiMessage`/`qaQuestion`/`qaAnswer` state, and the
  `handleAskQuestion` Q&A path; keep `handleApplyPlan`/`handleDiscardPlan`/canvas wiring.
- **Modify** `apps/web/components/doc-panel.tsx` — `streamdown` viewer + Regenerate +
  load persisted MD.
- **Modify** `apps/web/lib/actions.ts` — add `getDiagramDoc`/`upsertDiagramDoc`; make
  `runDocGen` persist; remove `runAdvisorQuestion` once chat replaces it.
- **Modify** `packages/db/src/schema/app.ts` (+ generated migration) — `diagram_doc`.
- **Delete** `apps/web/components/change-plan-card.tsx`, `apps/web/components/assistant-panel.tsx`,
  `apps/web/components/inspector-panel.tsx` (superseded by the new components) — only
  after their behavior is fully ported.

## Error handling

- **No AI connected**: drawer shows Problems only; Chat tab hidden; Ask AI hidden.
- **Stream error / provider failure**: the failed turn renders an error bubble with a
  Retry affordance; the transcript is preserved.
- **Tool unsupported**: silent fallback to `runDiagramEdit` (see above).
- **Doc generation failure**: Docs panel shows the existing friendly error; persisted
  doc (if any) remains intact.
- **Empty/invalid edit plan**: proposal card shows "No changes proposed"; nothing is
  applied to the canvas.

## Testing

**Unit / integration:**
- `proposal-card` op grouping + icon/label mapping (reuse the `describe(op)` cases).
- Tab gating: `aiConnected=false` renders Problems-only, no Chat, no Ask AI.
- Chat route: prose path returns a UI message stream; `proposeEdit` tool routes to
  `planEdits` and returns a valid `EditPlan`; tool-unsupported path triggers fallback.
- `diagram_doc` `getDiagramDoc`/`upsertDiagramDoc` round-trip (upsert overwrites).

**Manual:**
- Ask a question → streamed prose answer in a received bubble.
- Ask AI from a problem → tab switches to Chat, response streams in.
- Editing instruction → phase pill → proposal card → Apply (diff + autosave) → Undo.
- Docs: generate → reload page → opens instantly from DB → Regenerate overwrites.

## Out of scope (follow-ups)

- Durable, per-diagram persisted chat history.
- Regenerating the AI-generated diagram from its original prompt.
- Multi-provider per-message model switching (tracked separately).
