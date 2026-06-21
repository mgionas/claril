# W16 — Collaboration P1: Comments & @mentions — Design Spec

**Date:** 2026-06-21
**Status:** Approved (brainstorm) — ready for plan
**Builds on:** W13 (Org→Workspace→Project tenancy + workspace roles admin/editor/viewer), W10 F2/F3 (AI-edit review card + canvas marks; persistent chat schema/UI), W9 (tabbed AI drawer).
**Goal:** Let a team discuss a diagram in context — threaded comments anchored to a diagram **element** or the **diagram as a whole**, @mention teammates, and an in-app **notification bell**. First slice of the P4 Collaboration phase; async and Vercel-safe (no realtime).

## Decomposition (P4 Collaboration)
- **W16 — Comments & @mentions** (this spec): async threads + bell. No realtime.
- **W17 — Review / approval workflow** (later): request review on a version; Approve / Request-changes; reuses the AI-edit card + marks.
- **W18 — Real-time multiplayer** (later, high-risk): live presence + co-editing (Liveblocks or self-hosted Yjs; needs persistent connections — not available on plain Vercel serverless).

## Current state (verified)
- **No** comment / notification / mention / activity tables; **no** email, toast, or realtime infrastructure (only AI SDK HTTP streaming for chat). Bell/inbox is greenfield.
- **Stable element ids:** bpmn-js `elementRegistry` ids are baked into the XML and survive edits; the canvas already marks elements via `canvas.addMarker(elementId, className)` (`apps/web/components/bpmn-canvas.tsx`, e.g. `claril-ai-edit` violet glow, diff markers). Distinct comment markers slot into the same system.
- **`chatMessage` table** (`packages/db/src/schema/app.ts`) + `lib/chat-actions.ts` + the tabbed **AI drawer** (Chat / Problems / Docs) are the templates for the comment store and the Comments tab.
- **Tenancy/roles:** `assertDiagramAccess(userId, diagramId)` returns a discriminated `{kind:"org",projectId,workspaceId} | {kind:"personal",personalProjectId}`; `requireWorkspaceRole`/`canDo` gate org actions. Personal diagrams are solo.

## Design

### 1. Scope decisions (locked in brainstorm)
- **Notifications:** in-app **bell only** this slice (no email). Email is a later slice.
- **Anchoring:** a thread targets a single **`elementId`** OR is **diagram-level** (`elementId = null`). Threads anchor to the **live** diagram, not a pinned version — if the anchored element is later deleted, the thread survives and surfaces in an **"Unanchored"** group.
- **Permissions:** **any role with diagram access (incl. viewer)** may create threads / reply / @mention. **Resolve / reopen:** thread author **or** editor+. **Edit / delete a comment:** its author (delete also allowed for org admin).
- **Org-only:** comments require a team, so the Comments UI and actions are **org-scoped**; personal diagrams hide the Comments tab and the actions reject personal diagrams.

### 2. Schema — migration `0011` (`packages/db/src/schema/app.ts`)
Three tables + one enum, mirroring existing conventions (`text` PKs, `timestamp` defaults, cascade FKs, indexes):

```ts
export const threadStatus = pgEnum("thread_status", ["open", "resolved"]);
export const notificationType = pgEnum("notification_type", ["mention", "reply", "resolved"]);

commentThread (
  id text PK,
  diagramId text NOT NULL → diagram.id ON DELETE cascade,
  elementId text NULL,                       // null = diagram-level
  status threadStatus NOT NULL default "open",
  resolvedBy text NULL → user.id ON DELETE set null,
  resolvedAt timestamp NULL,
  createdBy text NOT NULL → user.id ON DELETE cascade,
  createdAt timestamp NOT NULL default now,
  updatedAt timestamp NOT NULL default now,  // bumped on each new comment / status change → ordering by activity
  index (diagramId, status)
)

comment (
  id text PK,
  threadId text NOT NULL → commentThread.id ON DELETE cascade,
  body text NOT NULL,
  mentionedUserIds jsonb NOT NULL default '[]',   // string[] of user ids
  createdBy text NOT NULL → user.id ON DELETE cascade,
  createdAt timestamp NOT NULL default now,
  editedAt timestamp NULL,
  index (threadId, createdAt)
)

notification (
  id text PK,
  userId text NOT NULL → user.id ON DELETE cascade,   // recipient
  type notificationType NOT NULL,
  diagramId text NOT NULL → diagram.id ON DELETE cascade,
  threadId text NULL → commentThread.id ON DELETE cascade,
  commentId text NULL → comment.id ON DELETE cascade,
  actorId text NOT NULL → user.id ON DELETE cascade,  // who triggered it
  readAt timestamp NULL,
  createdAt timestamp NOT NULL default now,
  index (userId, readAt, createdAt)
)
```
Generate-only via `db:generate`; applied with explicit authorization. Additive — no change to existing tables.

### 3. Pure helpers (`lib/mentions.ts`, unit-tested)
- **`parseMentions(body: string, candidates: {id,name}[]): string[]`** — resolve `@Name` tokens in `body` to user ids that are in `candidates` (the diagram's workspace members). Returns the deduped id list to persist + notify on. Storing the resolved ids (not just raw text) decouples notification fan-out from re-parsing and from later display-name changes. Comment **rendering** highlights the same `@Name` tokens client-side; no special markup is stored in `body`.
- **`notifyTargets({ actorId, mentionedUserIds, participantIds }): { mention: string[]; reply: string[] }`** — pure fan-out: `mention` = mentionedUserIds − actor; `reply` = (participantIds − mentionedUserIds) − actor. A user mentioned in a reply gets one `mention`, not also a `reply`. (`participantIds` = distinct comment authors in the thread.)

### 4. Server actions
**`lib/comment-actions.ts`** (`"use server"`) — every action resolves the diagram via `assertDiagramAccess`; **throws if `kind !== "org"`** (org-only), then gates by workspace role:
- `listThreads(diagramId): ThreadView[]` — view gate; threads + their comments + author `{id,name,image}` + a flag `anchorExists` for element threads (whether `elementId` is still present is determined client-side against the live canvas, so the action just returns `elementId`). Ordered: open before resolved, then by `updatedAt` desc.
- `createThread({ diagramId, elementId?, body, mentionedUserIds }): { threadId }` — **view gate (viewers allowed)**; inserts thread + first comment; writes notifications via `notifyTargets` (participants = just the author here, so only `mention`s fire). Validates `body` non-empty (Zod). `revalidatePath` not needed (client refetches).
- `addComment({ threadId, body, mentionedUserIds }): { commentId }` — view gate (resolve diagram via the thread's `diagramId`); inserts comment; bumps thread `updatedAt`; notifies `mention` + `reply` targets.
- `resolveThread(threadId)` / `reopenThread(threadId)` — **author or editor+**; sets/clears `status`/`resolvedBy`/`resolvedAt`; bumps `updatedAt`; on resolve, notifies thread participants (`type:"resolved"`, minus actor).
- `editComment({ commentId, body, mentionedUserIds })` — author only; updates `body`/`mentionedUserIds`/`editedAt` (no new notifications for edits in v1).
- `deleteComment(commentId)` — author or org admin; if it was the thread's only comment, delete the thread too.
- `listMentionableUsers(diagramId): {id,name,image}[]` — view gate; the diagram's workspace members (org owners/admins included), for @-autocomplete.

**`lib/notification-actions.ts`** (`"use server"`, keyed by session user):
- `getUnreadCount(): number` — count where `userId = me AND readAt IS NULL`.
- `listNotifications(limit?): NotificationView[]` — recent, newest first, joined with actor name/image + diagram name + thread status; capped (default 30).
- `markNotificationsRead(ids?: string[])` — mark given ids (or all of mine) read.

Types exported: `ThreadView { id, elementId, status, createdBy, createdAt, updatedAt, resolvedBy?, comments: CommentView[] }`, `CommentView { id, body, mentionedUserIds, author: {id,name,image}, createdAt, editedAt? }`, `NotificationView { id, type, actor:{name,image}, diagramId, diagramName, threadId?, readAt?, createdAt }`.

### 5. Canvas integration (`components/bpmn-canvas.tsx` + workbench)
- Add a `claril-comment` marker (distinct accent, e.g. amber ring) + `CanvasApi.setCommentedElements(ids: string[])` / `clearCommentMarkers()` that badges elements with ≥1 **open** thread. Style in `globals.css`, distinct from `claril-ai-edit` (violet) and diff markers.
- Selecting an element exposes a "Comment" affordance (workbench-level button when an element is selected — no bpmn-js context-pad surgery needed for v1); it opens the Comments tab with a composer pre-anchored to that `elementId`.
- The workbench tracks the current bpmn-js selection (`selection.changed`) so the Comments tab knows the active element and can label "Commenting on: «element name»".
- Clicking an element-anchored thread in the tab → `canvas.focusElement(elementId)` (fit/center + transient highlight) if the element still exists; else the thread shows an "element removed" hint and lives under Unanchored.

### 6. UI — Comments tab (`components/comments-tab.tsx` + subcomponents)
Add **Comments** to the AI drawer tab set (org diagrams only; hidden in personal scope). Components:
- **`ThreadList`** — groups: **Open** (element + general), **Resolved** (collapsed), **Unanchored** (open threads whose `elementId` no longer matches a live element). Each row: anchor label (element name from the canvas, or "General"), snippet of the last comment, participant avatars, relative time, status pill. A header **"New comment"** → composer (anchored to the selected element if any, else diagram-level).
- **`ThreadView`** — back to list; ordered comments (avatar + name + relative time + body with `@Name` highlighted + edited tag); author can edit/delete a comment; **Resolve/Reopen** (gated). Reply **`Composer`** at the bottom.
- **`Composer`** — auto-growing textarea (reuse chat composer idiom) with **@-autocomplete**: typing `@` opens a member picker (`listMentionableUsers`), arrow/enter to insert `@Name`; on submit, `parseMentions` resolves ids and the create/add action runs, then the list refetches. Element label shown when anchored.
- Data fetched on tab open and after each mutation (no realtime). A small "Refresh" affordance; counts update from refetch.

### 7. Notification bell (`components/notification-bell.tsx` in `app-shell.tsx` header)
- Bell icon + unread badge (from `getUnreadCount`, fetched on shell mount; refetched on route change). Dropdown (shadcn `DropdownMenu`/popover) lists `listNotifications`: "**Actor** mentioned you / replied / resolved a thread on **Diagram**", relative time, unread dot. Opening the dropdown marks the shown unread ones read (`markNotificationsRead`). Each item links to `/d/[diagramId]?thread=<id>`; the workbench reads `?thread=` to auto-open the Comments tab on that thread.
- Bell appears in the org context only (personal users have no team to notify them); render it whenever the user is in an org context (mentions can only originate on org diagrams).

### 8. Effect / data flow
Create/reply → action validates access + persists → fan-out rows in `notification` → next time a recipient loads any page, the bell count reflects it; opening the deep link jumps to the thread. Element markers reflect open threads on diagram load.

## Components & boundaries
- `packages/db` — schema additions + migration `0011` (enums + 3 tables).
- `lib/mentions.ts` (new, pure) — `parseMentions`, `notifyTargets` (+ unit tests).
- `lib/comment-actions.ts` (new) — thread/comment/resolve + mentionable users; org-only, role-gated.
- `lib/notification-actions.ts` (new) — bell count/list/mark-read.
- `components/comments-tab.tsx` (+ `thread-list`, `thread-view`, `comment-composer`) — the drawer tab.
- `components/notification-bell.tsx` (new) — top-bar bell, mounted in `app-shell.tsx`.
- `components/bpmn-canvas.tsx` + the workbench + `d/[diagramId]/page.tsx` — comment markers, selection tracking, Comments tab wiring, `?thread=` deep-link.
- `globals.css` — `claril-comment` marker style.
- No change to personal scope beyond hiding the tab/bell entry points; no resolver/AI change.

## Testing
- **Unit (pure):** `parseMentions` (matches names, dedupes, ignores unknown/self where applicable, multiple mentions), `notifyTargets` (mention/reply split, actor excluded, mention-in-reply counts once).
- **Access:** comment actions reject personal diagrams; reject non-members; viewer can create/reply but cannot resolve another's thread; author/editor can resolve.
- Build + typecheck; existing suites green.
- **Migration:** additive `0011` (3 new tables, 2 enums) — dry-run, then apply with authorization.
- **Manual:** on an org diagram, select an element → comment → @mention a workspace member → that member's bell shows 1 → opening the deep link jumps to the thread → reply → resolve; create a diagram-level thread; delete the commented element and confirm the thread moves to Unanchored; confirm personal diagrams show no Comments tab / no bell mentions.

## Out of scope (W16)
Email notifications, realtime/live updates (refresh-on-open only), reactions/emoji, attachments/images, rich-text (plain text + @mention highlight only), version-pinned comments, multiplayer presence/cursors (W18), comment search, per-comment permalinks beyond `?thread=`.

## Self-review
- **Placeholders:** none — schema, pure helpers, action set with gates, and component breakdown are concrete.
- **Consistency:** reuses `assertDiagramAccess`/`requireWorkspaceRole`/`canDo`, the `chatMessage`/drawer-tab patterns, and the canvas `addMarker` system; additive migration; personal scope only loses entry points.
- **Scope:** comments + mentions + bell only; review workflow (W17) and multiplayer (W18) explicitly deferred; email deferred.
- **Ambiguity:** threads anchor to live elements (orphan → Unanchored, not deleted); viewers may comment but not resolve others' threads; comments are org-only; mentions persist resolved user ids (display re-derives names); the bell is refresh-on-load (no realtime).
