# F2 — AI-edit review (mark on board + Approve / Roll back / Keep refining) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the AI applies an edit, mark the changed elements distinctly on the canvas (violet, not version-diff green) and turn the chat proposal card into an explicit **Approve / Roll back / Keep refining** review, with marks persisting until the user resolves them.

**Architecture:** Add a dedicated AI-edit marking API to the canvas (`markAiEdit`/`clearAiEdit` + a `.claril-ai-edit` violet marker) kept separate from the version-diff marks so the two never clobber each other. Rework the live-apply flow in `bpmn-workbench`: `handleProposal` applies the plan and marks it violet (pending); the `ProposalCard` exposes Approve (clear marks, snapshot an `ai` version), Roll back (revert to pre-edit XML, clear marks), and Keep refining (focus the chat composer for a follow-up). Thread `onKeepRefining` through `AiDrawer → ChatTab → ProposalCard`, and add a `focusComposer()` method to the chat handle.

**Tech Stack:** Next.js 16 / React 19, bpmn-js (canvas markers via `canvas.addMarker`/`removeMarker`), Tailwind v4 + CSS custom properties, AI SDK v6 `useChat` tool-part rendering.

**No DB / no migration.** Builds entirely on the existing apply-edit-plan + canvas marker plumbing (F1 left `forceSnapshot("ai", …)` already wired into `handleApplyPlan`).

---

### Task 1: Canvas — `.claril-ai-edit` marker + `markAiEdit`/`clearAiEdit` API

**Files:**
- Modify: `apps/web/app/globals.css` (after the version-diff block, ~line 339)
- Modify: `apps/web/components/bpmn-canvas.tsx` (CanvasApi interface ~32-45; marker constants ~47-52; the api object ~370-380; add a tracking ref + two functions near `applyDiff` ~236-262)

- [ ] **Step 1: Add the violet AI-edit color token + marker CSS**

In `apps/web/app/globals.css`, add a token next to the others (after `--color-success: #34d399;` at line 23):
```css
  --color-ai-edit: #a78bfa;
```
Then, immediately AFTER the version-diff overlay block (after line 339, the `.djs-connection.claril-diff-changed` rule), add:
```css
/* ---- AI-edit overlay (elements an AI proposal just changed; pending review).
   Distinct violet + soft glow so it never reads as a version diff. */
.djs-element.claril-ai-edit .djs-visual > :where(rect, circle, ellipse, polygon, path) {
  stroke: var(--color-ai-edit) !important;
  stroke-width: 2px !important;
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--color-ai-edit) 60%, transparent));
}
.djs-connection.claril-ai-edit .djs-visual > path {
  stroke: var(--color-ai-edit) !important;
  stroke-width: 2px !important;
}
```

- [ ] **Step 2: Extend the CanvasApi interface**

In `apps/web/components/bpmn-canvas.tsx`, add two methods to the `CanvasApi` interface (after `applyEditPlan` at line 44):
```tsx
  /** Mark elements an AI proposal just changed (violet, pending review). */
  markAiEdit: (ids: string[]) => void;
  /** Remove all AI-edit marking. */
  clearAiEdit: () => void;
```

- [ ] **Step 3: Add a separate tracking ref for AI-edit marks**

Find where `diffMarkedRef` is declared (a `useRef<string[]>([])` near the top of the component). Add a sibling ref right after it:
```tsx
  const aiEditMarkedRef = useRef<string[]>([]);
```
(If `diffMarkedRef` is declared as `const diffMarkedRef = useRef<string[]>([]);`, mirror that exactly.)

- [ ] **Step 4: Implement `markAiEdit` / `clearAiEdit`**

Right after the `applyDiff` function (ends ~line 262), add:
```tsx
    const clearAiEditMarks = () => {
      const canvas = modeler.get("canvas") as unknown as {
        removeMarker: (id: string, cls: string) => void;
      };
      for (const id of aiEditMarkedRef.current) {
        try {
          canvas.removeMarker(id, "claril-ai-edit");
        } catch {
          /* element may be gone */
        }
      }
      aiEditMarkedRef.current = [];
    };

    const markAiEdit = (ids: string[]) => {
      clearAiEditMarks();
      const canvas = modeler.get("canvas") as unknown as {
        addMarker: (id: string, cls: string) => void;
      };
      const registry = modeler.get("elementRegistry") as unknown as {
        get: (id: string) => unknown;
      };
      const marked = new Set<string>();
      for (const id of ids) {
        if (!registry.get(id)) continue;
        try {
          canvas.addMarker(id, "claril-ai-edit");
          marked.add(id);
        } catch {
          /* ignore */
        }
      }
      aiEditMarkedRef.current = [...marked];
    };
```

- [ ] **Step 5: Expose them on the api object**

In the object passed to `onReady` (where `showDiff: applyDiff, clearDiff: clearDiffMarks, applyEditPlan: …` are set, ~line 376), add:
```tsx
          markAiEdit,
          clearAiEdit: clearAiEditMarks,
```

- [ ] **Step 6: Ensure AI marks are cleared on reload**

In `reloadXml` (starts ~line 264) the body calls `clearDiffMarks()` first. Add `clearAiEditMarks()` next to it so a restore/rollback that reimports XML also drops AI marks:
```tsx
    const reloadXml = async (xml: string) => {
      clearDiffMarks();
      clearAiEditMarks();
      await modeler.importXML(xml);
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS. (`markAiEdit`/`clearAiEdit` are defined and exposed; not yet called by the workbench — Task 3 wires them.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/globals.css apps/web/components/bpmn-canvas.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): AI-edit marking API (violet, separate from version diff)

markAiEdit/clearAiEdit + .claril-ai-edit overlay; cleared on reloadXml.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ProposalCard — Approve / Roll back / Keep refining + pending state

**Files:**
- Modify: `apps/web/components/proposal-card.tsx`

- [ ] **Step 1: Extend the props and rewrite the action row**

Replace the `ProposalCard` signature + the trailing action block. Add `onKeepRefining` and use clearer pending wording. New props block:
```tsx
export function ProposalCard({
  plan,
  applied,
  busy,
  onApply,
  onDiscard,
  onKeepRefining,
}: {
  plan: EditPlan;
  applied: boolean;
  busy?: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onKeepRefining: () => void;
}) {
```
Update the imports line to add the icons used below (`Check`, `Undo2` already imported; add `RotateCcw`, `MessageCirclePlus`):
```tsx
import { Plus, ArrowRight, Pencil, Trash2, Check, RotateCcw, MessageCirclePlus } from "lucide-react";
```
(Drop `Undo2` if it's no longer used after this change.)

- [ ] **Step 2: Add a pending banner and the three-button row**

When `!empty`, replace the existing two-button `<div className="flex gap-2">…</div>` with a pending hint (shown once applied) + a three-action row:
```tsx
      {!empty && (
        <div className="space-y-2">
          {applied && (
            <p className="text-[11px] text-fg-subtle">Applied to canvas — review:</p>
          )}
          <div className="flex flex-wrap gap-2">
            {!applied ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onApply}
                  className="flex items-center gap-1 rounded-[6px] bg-accent px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={onDiscard}
                  className="flex items-center gap-1 rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-elevated"
                >
                  Discard
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onApply}
                  className="flex items-center gap-1 rounded-[6px] bg-accent px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
                >
                  <Check className="size-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={onDiscard}
                  className="flex items-center gap-1 rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-elevated"
                >
                  <RotateCcw className="size-3.5" />
                  Roll back
                </button>
                <button
                  type="button"
                  onClick={onKeepRefining}
                  className="flex items-center gap-1 rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-elevated"
                >
                  <MessageCirclePlus className="size-3.5" />
                  Keep refining
                </button>
              </>
            )}
          </div>
        </div>
      )}
```

Semantics: before apply (`applied=false`) the card shows **Apply / Discard** (unchanged entry point). The proposal is live-applied immediately by the workbench (see Task 3), so in practice `applied` becomes true right away and the card shows the review actions: **Approve** (keep + snapshot), **Roll back** (revert), **Keep refining** (focus composer). Keep the `groupOps`/sections rendering above unchanged.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: FAIL — `chat-tab.tsx` renders `<ProposalCard>` without the now-required `onKeepRefining`. That's fixed in Task 3. (If you prefer a green checkpoint, you may proceed straight to Task 3 before committing; commit Tasks 2+3 together. Do NOT commit a red typecheck on its own.)

> Because ProposalCard's new required prop ripples through ChatTab → AiDrawer → workbench, **Tasks 2 and 3 are committed together** after Task 3's typecheck passes. Do the edits for Task 2, then immediately Task 3, then commit once.

---

### Task 3: Thread the review flow (ChatTab → AiDrawer → workbench) + focusComposer

**Files:**
- Modify: `apps/web/components/chat-tab.tsx`
- Modify: `apps/web/components/ai-drawer.tsx`
- Modify: `apps/web/components/bpmn-workbench.tsx`

- [ ] **Step 1: ChatTab — add `onKeepRefining` prop + `focusComposer` on the handle**

In `apps/web/components/chat-tab.tsx`:

Add to `ChatTabHandle`:
```tsx
export interface ChatTabHandle {
  /** Inject a message into the transcript (used by "Ask AI" from Problems). */
  ask: (text: string) => void;
  /** Focus the composer textarea (used by "Keep refining"). */
  focusComposer: () => void;
}
```
Add `onKeepRefining` to `ChatTabProps`:
```tsx
  onApplyPlan: () => void;
  onDiscardPlan: () => void;
  onKeepRefining: () => void;
```
Update the imperative handle to expose `focusComposer` (it already exposes `ask`):
```tsx
  useImperativeHandle(props.handleRef, () => ({
    ask: (text) => send(text),
    focusComposer: () => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        // place caret at end
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    },
  }));
```
Pass `onKeepRefining` to the `<ProposalCard>` render:
```tsx
                    <ProposalCard
                      key={i}
                      plan={part.output as EditPlan}
                      applied={props.planApplied}
                      onApply={props.onApplyPlan}
                      onDiscard={props.onDiscardPlan}
                      onKeepRefining={props.onKeepRefining}
                    />
```

- [ ] **Step 2: AiDrawer — thread `onKeepRefining`**

In `apps/web/components/ai-drawer.tsx`, add to `AiDrawerProps` (next to `onApplyPlan`/`onDiscardPlan`):
```tsx
  onApplyPlan: () => void;
  onDiscardPlan: () => void;
  onKeepRefining: () => void;
```
And pass it into `<ChatTab>`:
```tsx
              <ChatTab
                handleRef={props.chatHandleRef}
                getContext={props.getChatContext}
                planApplied={props.planApplied}
                onProposal={props.onProposal}
                onApplyPlan={props.onApplyPlan}
                onDiscardPlan={props.onDiscardPlan}
                onKeepRefining={props.onKeepRefining}
                onGenerateDocs={props.onGenerateDocs}
                onReview={props.onReview}
              />
```

- [ ] **Step 3: workbench — mark violet on apply; Approve / Roll back / Keep refining handlers**

In `apps/web/components/bpmn-workbench.tsx`:

Rework `handleProposal` to mark the AI edit violet (instead of the green diff) and flag it pending:
```tsx
  // Apply the AI's proposed plan live, marked violet pending review.
  const handleProposal = useCallback((proposed: EditPlan) => {
    setPlanApplied(false);
    if (proposed.ops.length > 0) {
      preEditXmlRef.current = currentXmlRef.current;
      const changed = canvasApiRef.current?.applyEditPlan(proposed) ?? [];
      canvasApiRef.current?.markAiEdit(changed);
      setPlanApplied(true); // applied to canvas; awaiting Approve / Roll back
    }
  }, []);
```
> Note: `planApplied` now flips to `true` as soon as the plan is applied, so the ProposalCard shows the review actions (Approve/Roll back/Keep refining) immediately, matching the "applied — review" UX.

Update `handleApplyPlan` (Approve) — clear the violet marks; keep the F1 `forceSnapshot("ai", …)`:
```tsx
  const handleApplyPlan = useCallback(() => {
    canvasApiRef.current?.clearAiEdit();
    setPlanApplied(false); // resolved
    forceSnapshot("ai", "AI edit"); // change already applied to the model; snapshot it
  }, [forceSnapshot]);
```

Update `handleDiscardPlan` (Roll back) — clear marks + revert to pre-edit XML:
```tsx
  const handleDiscardPlan = useCallback(() => {
    canvasApiRef.current?.clearAiEdit();
    void canvasApiRef.current?.reloadXml(preEditXmlRef.current);
    setPlanApplied(false);
  }, []);
```

Add `handleKeepRefining` — leave marks/pending as-is, jump to chat, focus composer:
```tsx
  const handleKeepRefining = useCallback(() => {
    setInspectorOpen(true);
    setActiveTab("chat");
    chatHandleRef.current?.focusComposer();
  }, []);
```

Pass `onKeepRefining={handleKeepRefining}` into `<AiDrawer>` (next to `onApplyPlan`/`onDiscardPlan`):
```tsx
        onApplyPlan={handleApplyPlan}
        onDiscardPlan={handleDiscardPlan}
        onKeepRefining={handleKeepRefining}
```

> The old `handleProposal` called `showDiff({ added: changed, … })` (green). That call is removed — AI edits now use `markAiEdit` (violet). Version-diff `showDiff`/`clearDiff` stays for the History menu. The two marker sets are independent (separate refs + classes), so an open History diff and a pending AI edit can coexist without clobbering.

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter web typecheck`
Expected: PASS.
Run: `pnpm --filter web build`
Expected: build completes, no errors.

- [ ] **Step 5: Commit (Tasks 2 + 3 together)**

```bash
git add apps/web/components/proposal-card.tsx apps/web/components/chat-tab.tsx apps/web/components/ai-drawer.tsx apps/web/components/bpmn-workbench.tsx
git commit -m "$(cat <<'EOF'
feat(web): AI-edit review — Approve / Roll back / Keep refining

Live-apply marks elements violet (pending); ProposalCard offers Approve
(clear + snapshot), Roll back (revert pre-edit XML), Keep refining (focus
composer). Threads onKeepRefining + focusComposer through the drawer.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual verification

**Files:** none (runtime check). Requires an AI provider configured.

- [ ] **Step 1: Run the dev server and exercise the review flow**

Run: `pnpm --filter web dev`
1. In chat, ask for a change (e.g. "add a 'Notify customer' task after the approval gateway"). When the proposal streams in, the changed elements get a **violet glow** on the canvas and the card shows **Approve / Roll back / Keep refining** with "Applied to canvas — review:".
2. **Approve** → violet marks clear; open the History menu → an **AI** version is recorded.
3. Re-run a change, then **Roll back** → canvas reverts to the pre-edit state; violet marks clear; no AI version kept for the rolled-back edit.
4. Re-run a change, then **Keep refining** → drawer stays on Chat, composer is focused, violet marks persist; type a follow-up → the new proposal supersedes (re-marks) the pending one.
5. Open a History **Diff** while an AI edit is pending → version-diff colors and the violet AI marks are both visible and don't erase each other.

Expected: all behaviors as described. Note any deviation before merging.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-20-history-ai-review-chat-memory-design.md` §F2):
- Distinct on-board marking (`claril-ai-edit`, violet, animated/glow), separate from version diff → Task 1. ✓ (Chose a parallel `markAiEdit`/`clearAiEdit` API rather than extending the shared `DiffMarks` — keeps version-diff and AI-edit independent, per the spec's "or add a parallel `markAiEdit`" option.)
- ProposalCard actions → Approve / Roll back / Keep refining → Task 2. ✓
- Approve = keep + clear marks + snapshot `ai` version → Task 3 `handleApplyPlan` (F1's `forceSnapshot("ai","AI edit")` retained). ✓
- Roll back = revert `preEditXml` + clear marks → Task 3 `handleDiscardPlan`. ✓
- Keep refining = leave applied-pending + focus composer; new proposeEdit supersedes → Task 3 `handleKeepRefining` + `markAiEdit` clearing prior marks on the next proposal. ✓
- Clear pending state ("Applied to canvas — review:") until resolved → Task 2 banner. ✓
- Marks persist while pending → only cleared on Approve / Roll back / next proposal. ✓
- No schema change → confirmed. ✓

**Placeholder scan:** none — all steps contain concrete code.

**Type consistency:** `onKeepRefining: () => void` added identically to `ProposalCard` props, `ChatTabProps`, `AiDrawerProps`, and supplied by the workbench as `handleKeepRefining`. `ChatTabHandle` gains `focusComposer: () => void`, implemented in `useImperativeHandle` and called by `handleKeepRefining`. `markAiEdit(ids: string[])`/`clearAiEdit()` defined on `CanvasApi` (Task 1) and called in the workbench (Task 3). `planApplied` semantics updated consistently (flips true on apply, false on resolve).

**Risk note:** `handleProposal` now sets `planApplied=true` immediately. Previously it set `false` and `handleApplyPlan` set `true`. Verify no other code reads `planApplied` expecting the old meaning — grep shows it flows only into `ProposalCard.applied` (controls Apply-vs-Approve rendering), so the new meaning ("applied to canvas, awaiting review") is correct end-to-end.

## Out of scope (later)
- Per-proposal rollback history beyond the single `preEditXmlRef` snapshot (multi-step refine chains revert one level — the pre-edit state of the latest proposal).
- Animating the marks beyond the static glow.
