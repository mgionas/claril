# Agentic AI editing + Assistant panel — design

- **Date:** 2026-06-20
- **Status:** Approved approach (pending spec review)
- **Supersedes nothing; extends:** the existing read-only advisor (critique/Q&A/doc-gen, W6) and the W4 diff infrastructure.

## Goal

Turn Claril's AI from a **reviewer** into a **co-editor**. Today the advisor can
only describe a diagram and add findings; it refuses to change the model. Users
want to drive the model with natural language — e.g. *"add two pools, User and
BFF; user clicks Pay, BFF fetches data and returns details, awaits approval; if
approved continue, else stop"* — and have the AI **create/update/delete**
elements, with the human approving before anything is applied.

## Decisions (locked)

1. **Execution model:** AI returns a typed, validated **EditPlan**; the app shows
   it as a card + a ghost diff on the canvas; the user **Applies or Discards**.
   Deterministic execution, one undo step. (Not live mutation, not raw-XML regen.)
2. **Chat is the main right panel.** The right drawer becomes the **Assistant**:
   deterministic findings render as **cards inside it**, and the conversation +
   instruction input live in the same panel. It must still work with **AI off**
   (findings cards + a "connect AI" prompt instead of the input) — the
   deterministic inspector stays the offline moat, just re-homed into this panel.
3. **First slice = agentic edit + HITL.** Persistence, multi-turn history, and
   accumulated project knowledge are later slices.

## Architecture (slice 1)

Five units, each independently testable.

### 1. EditPlan schema — `packages/shared` (or `@claril/ai-advisor`)
A Zod schema describing a declarative, layout-free change set. Operations
reference elements either by an existing bpmn `elementId` or a plan-local
`tempId` (for elements created earlier in the same plan).

```
EditPlan = { summary: string; ops: Op[] }
Op (discriminated union by `kind`):
  - addPool        { tempId, name }
  - addLane        { tempId, poolRef, name }
  - addNode        { tempId, type: startEvent|endEvent|task|userTask|serviceTask
                              |exclusiveGateway|parallelGateway|intermediateEvent,
                     name?, containerRef? (pool/lane tempId or elementId) }
  - connect        { fromRef, toRef, label?, flow: "sequence" | "message" }
  - updateElement  { elementId, name? }
  - deleteElement  { elementId }
```
Notes: cross-pool connections must use `flow: "message"`; within a process,
`flow: "sequence"`. The schema is provider-neutral and carries no x/y.

### 2. Planner — `@claril/ai-advisor` (`planEdits`)
`planEdits(input, config): Promise<EditPlan>` where `input = { graph, findings,
assetContext?, instruction }`. Uses the existing BYOK provider abstraction
(`createModel`) with **structured output** (`generateObject` + the EditPlan Zod
schema). System prompt: ground on the current graph (ids + types + labels +
edges) and assets; produce a **minimal valid plan**; reference existing elements
by id; prefer message flows between pools; never invent coordinates. Reuses the
advisor's `describeGrounding`. Pure package code, no DOM.

### 3. Executor — `apps/web/lib/apply-edit-plan.ts` (client, bpmn-js)
`applyEditPlan(modeler, plan): void` — translates ops to `modeling` calls inside
a **single command-stack action** (one undo):
- pools → `modeling.createShape` participant / `elementFactory.createParticipantShape`
- lanes → `modeling.addLane` / lane creation on the participant
- nodes → `appendShape`/`createShape` into the resolved container
- connect → `createConnection` (sequence) or message flow on the collaboration
- update → `modeling.updateProperties`; delete → `modeling.removeElements`
Resolves `tempId → created element`. Positions via **`bpmn-auto-layout`** (verify
latest) or incremental layout. Extends the existing `apply-fix.ts` executor
pattern. Exposed through the existing `CanvasApi` (new `applyEditPlan` method).

### 4. Preview / HITL — reuse W4
Before applying for real:
1. snapshot `currentXml` (already mirrored in `currentXmlRef`).
2. `applyEditPlan` on the live modeler (visible immediately).
3. compute marks from the plan (added/changed element ids) → `CanvasApi.showDiff`
   (W4) to highlight on canvas; render the op list as a **change-plan card**.
4. **Apply** → keep, `clearDiff`, autosave, re-inspect. **Discard** →
   `CanvasApi.reloadXml(snapshot)` (revert) — both already exist from W4.
This avoids a second headless modeler and reuses W4's differ/markers/reload.

### 5. Assistant panel — `apps/web/components/assistant-panel.tsx`
Replaces the Inspector drawer as the main right panel (the W4 History drawer and
the canvas toggles stay). Contents, top→bottom:
- **Findings cards** (deterministic, always rendered — AI-off safe): severity,
  message, `Fix`, `Show on canvas` (reuse current finding row behavior).
- **Conversation** (slice 1: minimal — the latest instruction + AI summary +
  change-plan card; full multi-turn history is slice 2).
- **Input + suggestion chips**: `[Generate from prompt] [Fix all] [Document]
  [Ask…]`. When AI is off, the input is replaced by a "Connect AI" prompt that
  opens `AiSettingsDialog`.
Merges today's **Ask AI / Q&A / doc-gen** entry points into this one surface
(the command-bar buttons become chips here).

## Data flow

```
user instruction ─▶ runPlanEdits (server action, BYOK, grounded) ─▶ EditPlan
  ─▶ applyEditPlan(modeler, plan) [live, 1 undo] ─▶ showDiff(marks) + plan card
       ├─ Apply   ─▶ clearDiff ─▶ saveDiagramContent ─▶ re-inspect
       └─ Discard ─▶ reloadXml(snapshot)
```

Server action `runDiagramEdit(graph, instruction, diagramId?)` in
`apps/web/lib/actions.ts` mirrors `runAdvisor`'s config/grounding resolution and
returns the `EditPlan` (validated). Authorized via `requireUserId`.

## Components & boundaries
- `@claril/ai-advisor`: `EditPlan` type + `planEdits` (no DOM, unit-testable with a stub model).
- `apps/web/lib/apply-edit-plan.ts`: pure translation of EditPlan → modeling calls (testable against a bpmn-js instance).
- `apps/web/lib/actions.ts`: `runDiagramEdit` server action (thin).
- `assistant-panel.tsx`: presentation + HITL controls; depends on `CanvasApi`.

## Error handling
- **Invalid/empty plan:** planner returns `{ summary, ops: [] }` → panel shows "No change proposed" with the model's explanation; nothing applied.
- **Executor failure on an op:** the whole command-stack action is aborted/rolled back (no partial apply); surface a friendly error; offer Discard.
- **AI off / no provider:** chips that need AI route to `AiSettingsDialog`; findings + manual editing unaffected.
- **Ungrounded references:** ops referencing unknown element ids are dropped with a warning in the plan card (don't fail the whole plan).

## Testing
- `planEdits`: unit tests with a stubbed model asserting schema-valid plans for representative instructions (add pool, connect, delete).
- `apply-edit-plan`: tests against a bpmn-js modeler — apply a known plan, assert resulting graph (nodes/edges/pools) and single-undo reverts cleanly.
- Round-trip: instruction → plan → apply → re-inspect produces expected findings delta.
- Manual: the payment-flow example end-to-end (pools, message flows, approval gateway), Apply + Discard.

## Scope / phasing
- **Slice 1 (this spec):** EditPlan + planner + executor + W4-based preview + Assistant panel shell (findings cards + single-turn instruction + chips). The "primary idea" working end-to-end.
- **Slice 2:** persistent multi-turn chat (`chat_session`/`chat_message` tables), streaming, conversation history, applied-change provenance.
- **Slice 3:** persistent project knowledge (conventions/decisions) fed into grounding.
- **Slice 4:** richer cards (asset cards, inline finding→fix in chat), polish.

## Out of scope (YAGNI for slice 1)
- Multi-turn memory / persistence (slice 2).
- Live token-by-token streaming of edits (we plan-then-apply).
- Non-BPMN kinds (Sequence/C4 are Mermaid text — a separate future capability).
- Multi-provider model switching (separate workstream; schema already staged).
