# History, AI-Edit Review & Chat Memory — Design Spec

**Date:** 2026-06-20
**Status:** Draft for review
**Scope:** Three related features in `apps/web` (decomposed; built in order F1 → F2 → F3).

A batch of follow-ups to the AI-drawer work, grounded on the user's decisions:

- **Replace** the just-shipped diagram **Archive** (soft-delete) with a **History** timeline of changes.
- **Auto-save all changes** as versions, **smart-throttled**.
- Present History as a **notifications-style dropdown panel** from a top-bar History icon — out of the right-edge drawer.
- After an AI edit: **mark changes distinctly on the canvas** and offer **Approve / Roll back / Keep refining** in chat.
- **Persist chat** per diagram (survive reload) and **cut tokens** via a **DB-cached knowledge summary** so the agent doesn't re-send the full graph or cold-start/guess each turn.

---

## F1 — History (auto-versioning + dropdown panel)

### Revert the diagram-archive feature first
Commit `696e030` (diagram soft-delete: `archivedAt` column, archive/restore actions, dashboard "Archived" section, top-bar Archive button) is **reverted**. The top-bar slot it occupied (before Settings) becomes the **History** trigger.

- Remove: `archiveDiagram`/`restoreDiagram`/`listArchivedDiagrams`, the dashboard `ArchivedSection`, the `listProjects` `archivedAt` filter, the top-bar Archive button, the page-level `listArchivedDiagrams` load.
- The `diagram.archivedAt` column + migration `0005`: if `0005` was already applied to Neon, leave the column in place (nullable, unused) to avoid migration churn; drop it in a later cleanup. If not yet applied, delete the migration and the schema field. (Confirm at build time which case we're in.)

### Auto-versioning (smart throttle)
Today versions are manual-only (`createDiagramVersion`). Make them automatic with bounded volume:

- In `bpmn-workbench`, alongside the 800 ms autosave debounce, run a **version coalescer**: after a change, (re)arm a **10 s idle timer** and a **2 min max-age cap** — whichever fires first creates one snapshot of the latest XML, then resets. Rapid edits collapse into a single version.
- **Always** snapshot immediately (bypassing the throttle) on: **AI plan applied**, **import**, **restore**. These get descriptive labels.
- **No-op guard:** skip a snapshot if the content is byte-identical to the most recent version (avoids empty/duplicate rows on focus/blur).
- **Labels/source:** add a `source` column to `version` (`manual | auto | ai | import | restore`) so the timeline can badge entries; AI snapshots store the plan summary as `label`. (Migration — generate-only.)

`createDiagramVersion(diagramId, label?, source?)` gains the optional `source`. A new `autosnapshotVersion(diagramId, xml, source, label?)` does the no-op-guarded insert from the client.

### History dropdown panel (notifications-style)
Replace the right-edge `VersionsPanel` drawer + `historyOpen` toggle with a **top-bar History button** (clock icon, before Settings) that opens an **anchored dropdown panel** (shadcn `Popover`, widened ~`w-96`, max-height with internal `ScrollArea`):

- **Timeline list** newest-first: relative time, source badge (AI/auto/import/manual), label/summary, author.
- Per entry: **Restore** and **Diff** (reuses `restoreVersion` + `computeBpmnDiff` + canvas `showDiff`). Opening a diff colors the canvas behind the (dismissible) panel.
- The panel is scrollable and self-contained; closing clears any diff coloring.
- Remove `VersionsPanel`, the right-edge History toggle, and `historyOpen` from the workbench. Keep the canvas diff API (`showDiff`/`clearDiff`) — History and AI-review both use it.

**New component:** `history-menu.tsx` (the trigger + popover + list). Server actions `listVersions`/`restoreVersion`/`computeBpmnDiff` are reused (move out of `versions-panel.tsx` if they live there).

---

## F2 — AI-edit review (mark on board + approve/roll back/refine)

Refines today's live-apply + green-diff + `ProposalCard`:

- **Distinct on-board marking:** AI-applied elements get a dedicated marker class `claril-ai-edit` (accent/violet outline, subtly animated) — visually distinct from version-diff green/orange/blue. `handleProposal` calls `showDiff` with a new `aiEdit` bucket (extend `DiffMarks` with `aiEdit: string[]`, or add a parallel `markAiEdit(ids)` on `CanvasApi`). Cleared on Approve or Roll back.
- **Chat approval card:** the `ProposalCard`'s actions become **Approve** (keep; clears marks; snapshots an `ai` version), **Roll back** (revert to `preEditXml`; clears marks), and **Keep refining** (leave applied-pending and focus the composer so the user types a follow-up; a new `proposeEdit` supersedes the pending one). The card shows a clear pending state ("Applied to canvas — review:") until resolved.
- Wording/handlers: `onApplyPlan` → Approve, `onDiscardPlan` → Roll back, add `onKeepRefining` (focus composer; no canvas change). The on-board marks persist while pending so the user always sees what changed.

No schema change. Builds entirely on the existing apply-edit-plan + diff plumbing.

---

## F3 — Chat persistence + DB-cached knowledge (token cut)

### Persist chat per diagram
- New table `chat_message`: `id` PK, `diagramId` FK (cascade), `role` (`user|assistant`), `parts` (jsonb — the UI message parts, incl. tool outputs), `createdAt`. (Migration — generate-only.)
- Persist on completion: in `chat-tab`, on each finished turn (and tool result), persist the new messages via a server action `appendChatMessages(diagramId, messages)`. Hydrate `useChat({ messages: initialMessages })` from a server-loaded `getChatMessages(diagramId)` passed through the workbench → `AiDrawer` → `ChatTab`.
- A **Clear chat** control in the chat header wipes the thread (`clearChat(diagramId)`).

### DB-cached knowledge (fewer tokens, no cold-start guessing)
The chat route re-sends the full graph grounding every turn (~200–3500 tokens, and the source of the oversized 900 KB body). Replace with a cached summary:

- New table `diagram_knowledge`: `diagramId` PK, `summary` text (compact process synopsis), `graphHash` text, `model` text, `updatedAt`. (Migration — generate-only.)
- **Summary generation:** when the chat route runs, compute a cheap `graphHash` of the current graph. If `diagram_knowledge` is missing/stale (hash mismatch), regenerate a **compact** synopsis (short structured summary — lanes, key steps, decision points, bound assets — NOT the full node/flow dump) and upsert it. Reuse the advisor model (BYOK) with a tight summarizer prompt, or derive deterministically from the graph if cheaper.
- **Grounding:** the chat system prompt uses the cached **summary + findings** as primary context. Precise element ids are still provided **compactly** (id ↔ name table) so `proposeEdit` stays accurate, but the verbose flow narrative is dropped. Net: smaller per-turn body.
- **Cold-start avoidance:** because knowledge is persisted, reopening the diagram/chat reuses it immediately instead of re-deriving.

### Encoding safeguard (the 400 error)
Before sending to the provider, **sanitize** all user/model-supplied strings (messages, names, grounding) to strip or replace **unpaired UTF-16 surrogates** (`/[\uD800-\uDFFF]/` not part of a valid pair). This is what produced `400 invalid high surrogate`. Apply in the chat route just before `streamText`, and when persisting messages.

---

## Build order & isolation
1. **F1** — self-contained; reverts archive, auto-versioning, History dropdown. (DB: `version.source`.)
2. **F2** — refines AI-review UX; depends on nothing new. (No DB.)
3. **F3** — chat persistence + knowledge cache + surrogate sanitize. (DB: `chat_message`, `diagram_knowledge`.)

Each is its own implementation plan. Migrations are generate-only; applying to Neon stays an explicit, user-authorized step.

## Testing
- **F1:** coalescer fires once per idle/cap window; no-op guard skips identical content; AI/import/restore force a snapshot; dropdown lists newest-first with correct badges; restore + diff still work.
- **F2:** AI marks render distinctly and clear on Approve/Roll back; Roll back restores pre-edit XML; Keep refining leaves marks + focuses composer.
- **F3:** chat hydrates from DB on reload; append/clear round-trip; stale `graphHash` regenerates summary; chat body shrinks vs. full grounding; surrogate sanitizer strips a planted lone surrogate.

## Out of scope (later)
- Branching/named checkpoints beyond linear history.
- Cross-diagram chat or org-wide knowledge base.
- Dropping the unused `archivedAt` column (deferred cleanup).
