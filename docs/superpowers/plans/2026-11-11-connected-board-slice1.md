# Connected Board (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `board` diagram kind — a freeform Excalidraw canvas that embeds live-refreshing BPMN reference tiles and a "Related across diagrams" panel (deterministic asset-binding links + an AI narrative).

**Architecture:** The board is a new editor behind the existing `workbench.tsx` per-kind dispatch, standing alone like the Mermaid editor (reusing autosave + `saveDiagramContent` + `TopBar`). Content is Excalidraw scene JSON in the existing `content` text column (one enum migration). Embeds are Excalidraw image elements rendered from a referenced BPMN's current SVG (via a transient bpmn-js `Viewer`), carrying `customData.diagramId` + a hyperlink. Relations reuse the existing `elementAssetBinding` table; the AI narrates the deterministic list via the existing BYOK provider.

**Tech Stack:** Next.js 16 (App Router) + React 19, `@excalidraw/excalidraw@0.18.1` (MIT), `bpmn-js@18` Viewer, Drizzle/Postgres, Vercel AI SDK via `@claril/ai-advisor`, vitest.

## Global Constraints

- **Thin slice — build ONLY what the spec's Slice 1 lists.** Out of scope (do NOT build): catalog-reference authoring/reuse, versioned catalog/Jira import, a knowledge-graph table, `assetLink` traversal, decision capture, proactive reminders, live interactive nested editors, embedding non-BPMN kinds, binding board notes to assets, Sequence/C4 work, the L0 shell extraction, visual version diff for boards.
- **Additive & non-regressing:** existing BPMN/Sequence/C4 editors must behave exactly as before. A dispatch guard test pins routing.
- **Use latest stable deps; verify with `npm view`.** Pin `@excalidraw/excalidraw@0.18.1` (latest at plan time; re-verify at install).
- **No Claude attribution** in commits.
- Branch: `connected-board-slice1` (off `main`; the spec already lives there).
- **AI grounding rule:** the AI narrative is grounded strictly on the deterministic relation list — it narrates, never invents relations. Reuse `recordAiUsage` kind `"advisor"` (no new usage-enum value).
- **Verified API facts:**
  - Excalidraw 0.18.1: `import { Excalidraw, convertToExcalidrawElements, serializeAsJSON } from "@excalidraw/excalidraw"` + `import "@excalidraw/excalidraw/index.css"`. Mount client-only (`dynamic(..., {ssr:false})`) in a sized container. `excalidrawAPI={(a)=>...}` gives `{ addFiles(BinaryFileData[]), updateScene({elements, captureUpdate}), getSceneElements() }`. `serializeAsJSON(elements, appState, files, "database")` is positional and OMITS files. `BinaryFileData = { id, dataURL, mimeType, created }`. Elements support `customData?: Record<string,any>` and `link: string | null`.
  - bpmn-js: `import Viewer from "bpmn-js/lib/Viewer"; const v = new Viewer(); await v.importXML(xml); const { svg } = await v.saveSVG(); v.destroy();` — no container required, but attach the viewer container off-screen (`position:absolute;left:-9999px`, NOT `display:none`) before `saveSVG()` to avoid a 0-bbox in some engines.
  - Enum add: hand-written SQL migration `ALTER TYPE "public"."diagram_type" ADD VALUE 'board';` (mirror `drizzle/0010_pretty_solo.sql`); `ADD VALUE` cannot run in a transaction — do not rely on `drizzle-kit generate`.

---

## File Structure

**New:**
- `packages/db/drizzle/0014_board_kind.sql` — `ALTER TYPE … ADD VALUE 'board'`.
- `apps/web/components/board-workbench.tsx` — board shell (mirrors `mermaid-workbench.tsx`).
- `apps/web/components/board-canvas.tsx` — Excalidraw mount (client-only); scene↔content; embed insert; live refresh; selection→Related.
- `apps/web/components/related-panel.tsx` — related list + AI narrative.
- `apps/web/lib/board-scene.ts` — pure serialize/deserialize + `diagram-ref` element build/parse.
- `apps/web/lib/board-svg.ts` — client util: referenced BPMN XML → SVG data-URL via transient Viewer.
- `apps/web/lib/related.ts` — pure `groupRelationsByAsset` + `buildRelationsPrompt`.
- `apps/web/lib/board-actions.ts` — `"use server"`: `getRelatedForDiagram`, `summarizeRelations`, `getEmbeddableDiagrams`, `getDiagramContentForEmbed`.
- `packages/ai-advisor/src/relations.ts` — `summarizeRelationsWithUsage(input, config)`.
- Tests: `apps/web/lib/board-scene.test.ts`, `apps/web/lib/related.test.ts`, `apps/web/components/workbench.test.ts` (dispatch guard).

**Modified:**
- `packages/db/src/schema/app.ts` — add `"board"` to `diagramType` enum.
- `apps/web/lib/default-diagram.ts` — `DiagramKind` += `"board"`; `seedForKind`/`defaultNameForKind` cases; `defaultBoardDiagram` constant.
- `apps/web/components/workbench.tsx` — `board` branch before the Mermaid fall-through.
- `packages/ai-advisor/src/index.ts` — export `summarizeRelationsWithUsage`.

---

## Phase 1 — Board kind plumbing

### Task 1: Add the `board` diagram kind (enum, migration, kind model)

**Files:**
- Modify: `packages/db/src/schema/app.ts:10`
- Create: `packages/db/drizzle/0014_board_kind.sql`
- Modify: `packages/db/drizzle/meta/_journal.json` (register the migration — mirror how `0010` was registered)
- Modify: `apps/web/lib/default-diagram.ts:80` (union), `seedForKind`, `defaultNameForKind`, + new `defaultBoardDiagram`
- Test: `apps/web/lib/default-diagram.test.ts`

**Interfaces:**
- Produces: `DiagramKind = "bpmn" | "sequence" | "c4" | "board"`; `seedForKind("board")` → the empty-board JSON string; `defaultNameForKind("board")` → `"Untitled board"`; `defaultBoardDiagram` (exported const).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/default-diagram.test.ts
import { describe, expect, it } from "vitest";
import { seedForKind, defaultNameForKind, defaultBoardDiagram } from "./default-diagram";

describe("board kind", () => {
  it("seeds an empty Excalidraw scene for board", () => {
    expect(seedForKind("board")).toBe(defaultBoardDiagram);
    const parsed = JSON.parse(seedForKind("board"));
    expect(parsed.elements).toEqual([]);
    expect(parsed.version).toBe(1);
  });
  it("names a new board", () => {
    expect(defaultNameForKind("board")).toBe("Untitled board");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run default-diagram`
Expected: FAIL — `defaultBoardDiagram` is not exported / `seedForKind` has no board case.

- [ ] **Step 3: Add the enum value + migration**

In `packages/db/src/schema/app.ts:10` change:
```ts
export const diagramType = pgEnum("diagram_type", ["bpmn", "sequence", "c4", "board"]);
```

Create `packages/db/drizzle/0014_board_kind.sql` (mirror the hand-written `0010` precedent — plain SQL, no header):
```sql
ALTER TYPE "public"."diagram_type" ADD VALUE 'board';
```

Register it in `packages/db/drizzle/meta/_journal.json`: append an entry mirroring the last entry's shape (idx 14, the new tag `0014_board_kind`, a `when` timestamp, `version` matching the others). Read the final entry of `_journal.json` and copy its structure exactly, incrementing `idx` and setting `tag: "0014_board_kind"`.

- [ ] **Step 4: Add the kind-model cases**

In `apps/web/lib/default-diagram.ts`:
```ts
// near the other seed constants
export const defaultBoardDiagram = JSON.stringify({
  version: 1,
  source: "claril-board",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});
```
Update the union (line 80):
```ts
export type DiagramKind = "bpmn" | "sequence" | "c4" | "board";
```
Add to `seedForKind`'s switch:
```ts
    case "board":
      return defaultBoardDiagram;
```
Add to `defaultNameForKind`'s switch:
```ts
    case "board":
      return "Untitled board";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run default-diagram`
Expected: PASS (2 tests).

- [ ] **Step 6: Apply the migration to your dev DB + typecheck**

Run: `pnpm --filter @claril/db exec drizzle-kit migrate` (or the repo's migrate script — check `packages/db/package.json`). Then `pnpm typecheck`.
Expected: migration applies (`diagram_type` now includes `board`); typecheck is clean EXCEPT an expected error in `workbench.tsx:70` (`kind={kind}` no longer matches `Extract<DiagramKind,"sequence"|"c4">`) — that is the intended guardrail, fixed in Task 2. Note it and proceed.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/app.ts packages/db/drizzle/0014_board_kind.sql packages/db/drizzle/meta/_journal.json apps/web/lib/default-diagram.ts apps/web/lib/default-diagram.test.ts
git commit -m "feat(board): add 'board' diagram kind — enum, migration, seed/name"
```

---

### Task 2: Board workbench shell + empty Excalidraw canvas + dispatch branch

**Files:**
- Create: `apps/web/components/board-workbench.tsx`
- Create: `apps/web/components/board-canvas.tsx` (minimal empty mount here; embed/related added in later tasks)
- Modify: `apps/web/components/workbench.tsx` (add `board` branch before the Mermaid fall-through, ~line 69)

**Interfaces:**
- Consumes: `useAutosave` (`{saveState, schedule, retry}`), `saveDiagramContent(diagramId, content)`, `TopBar`, `AiSettingsDialog`.
- Produces: `<BoardWorkbench diagramId diagramName kind initialContent userName aiConnected aiProvider? diagramScope? />`; `<BoardCanvas initialContent onChange />` where `onChange: (content: string) => void`.

- [ ] **Step 1: Minimal BoardCanvas (empty board that reports scene JSON)**

```tsx
// apps/web/components/board-canvas.tsx
"use client";
import { useCallback } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { deserializeBoard } from "@/lib/board-scene";

export interface BoardCanvasProps {
  initialContent: string;
  onChange: (content: string) => void;
}

export default function BoardCanvas({ initialContent, onChange }: BoardCanvasProps) {
  const initial = deserializeBoard(initialContent);
  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      onChange(
        JSON.stringify({
          version: 1,
          source: "claril-board",
          elements,
          appState: { viewBackgroundColor: (appState as { viewBackgroundColor?: string }).viewBackgroundColor ?? "#ffffff" },
          files: files ?? {},
        }),
      );
    },
    [onChange],
  );
  return (
    <div className="h-full w-full">
      <Excalidraw
        initialData={{ elements: initial.elements, appState: initial.appState, files: initial.files }}
        onChange={handleChange as never}
      />
    </div>
  );
}
```

> Note: `deserializeBoard` is defined in Task 3. To keep Task 2 independently runnable, add a tiny inline fallback NOW and replace with the import in Task 3 — OR sequence Task 3 before wiring (recommended: do Task 3's `board-scene.ts` first if executing out of order). The serialize shape here is intentionally identical to `defaultBoardDiagram` so round-tripping is stable; Task 3 formalizes it as pure functions and this component switches to `serializeBoard`.

- [ ] **Step 2: BoardWorkbench shell (mirror MermaidWorkbench)**

```tsx
// apps/web/components/board-workbench.tsx
"use client";
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { saveDiagramContent } from "@/lib/actions";
import { TopBar } from "@/components/top-bar";
import { useAutosave } from "@/hooks/use-autosave";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";

const BoardCanvas = dynamic(() => import("@/components/board-canvas"), { ssr: false });

export interface BoardWorkbenchProps {
  diagramId: string;
  diagramName: string;
  initialContent: string;
  userName: string;
  aiConnected: boolean;
  aiProvider?: string;
  diagramScope: "org" | "personal";
}

export function BoardWorkbench(props: BoardWorkbenchProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveContent = useCallback(
    (content: string) => saveDiagramContent(props.diagramId, content),
    [props.diagramId],
  );
  const { saveState, schedule: handleChange, retry: retrySave } = useAutosave(saveContent);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-fg">
      <TopBar
        diagramId={props.diagramId}
        diagramName={props.diagramName}
        userName={props.userName}
        saveState={saveState}
        onRetrySave={retrySave}
        aiConnected={props.aiConnected}
        aiProvider={props.aiProvider}
        onOpenAiSettings={() => setSettingsOpen(true)}
      />
      <div className="h-[58px]" aria-hidden />
      <div className="min-h-0 flex-1">
        <BoardCanvas initialContent={props.initialContent} onChange={handleChange} />
      </div>
      <AiSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} initialProvider={props.aiProvider} />
    </main>
  );
}
```

(Confirm `TopBar`/`AiSettingsDialog` import paths + prop names against `mermaid-workbench.tsx` — copy them verbatim.)

- [ ] **Step 3: Add the dispatch branch**

In `apps/web/components/workbench.tsx`, add BEFORE the Mermaid fall-through (`return <MermaidWorkbench …`, ~line 70):
```tsx
  if (kind === "board") {
    return (
      <BoardWorkbench
        diagramId={diagramId}
        diagramName={diagramName}
        initialContent={initialContent}
        userName={userName}
        aiConnected={aiConnected}
        aiProvider={aiProvider}
        diagramScope={diagramScope}
      />
    );
  }
```
Import `BoardWorkbench` at the top. (`diagramScope` is already a `WorkbenchProps` field used by the BPMN branch — pass it through.)

- [ ] **Step 4: Verify typecheck + run the app**

Run: `pnpm typecheck` → clean (the Task-1 guardrail error at `workbench.tsx:70` is now resolved because `board` is handled above the fall-through).
Run the app (`pnpm --filter web dev`), create a board diagram (use the create flow — e.g. a new diagram of kind `board`), open `/d/<id>`: an empty Excalidraw canvas renders, drawing a shape and reloading persists it.
Expected: empty whiteboard works and autosaves.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/board-workbench.tsx apps/web/components/board-canvas.tsx apps/web/components/workbench.tsx
git commit -m "feat(board): board workbench shell + empty Excalidraw canvas + dispatch branch"
```

---

## Phase 2 — Scene persistence

### Task 3: Pure board-scene serialize/deserialize + diagram-ref element helpers

**Files:**
- Create: `apps/web/lib/board-scene.ts`
- Test: `apps/web/lib/board-scene.test.ts`
- Modify: `apps/web/components/board-canvas.tsx` (use `serializeBoard`/`deserializeBoard`)

**Interfaces:**
- Produces:
  - `type BoardScene = { elements: unknown[]; appState: { viewBackgroundColor: string }; files: Record<string, unknown> }`
  - `serializeBoard(elements: readonly unknown[], appState: { viewBackgroundColor?: string }, files: Record<string, unknown>): string`
  - `deserializeBoard(content: string): BoardScene` (tolerant: empty/invalid → empty scene)
  - `buildDiagramRefSkeleton(args: { fileId: string; diagramId: string; url: string; x: number; y: number; width: number; height: number }): object` — an Excalidraw image skeleton with `customData` + `link`
  - `readDiagramRef(element: { customData?: { type?: string; diagramId?: string }; fileId?: string }): { diagramId: string; fileId: string } | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/board-scene.test.ts
import { describe, expect, it } from "vitest";
import { serializeBoard, deserializeBoard, buildDiagramRefSkeleton, readDiagramRef } from "./board-scene";

describe("board-scene", () => {
  it("round-trips elements/appState/files", () => {
    const s = serializeBoard([{ id: "a" }], { viewBackgroundColor: "#eee" }, { f1: { id: "f1" } });
    const d = deserializeBoard(s);
    expect(d.elements).toEqual([{ id: "a" }]);
    expect(d.appState.viewBackgroundColor).toBe("#eee");
    expect(d.files).toEqual({ f1: { id: "f1" } });
  });
  it("tolerates empty/invalid content → empty scene", () => {
    expect(deserializeBoard("").elements).toEqual([]);
    expect(deserializeBoard("not json").elements).toEqual([]);
    expect(deserializeBoard("").appState.viewBackgroundColor).toBe("#ffffff");
  });
  it("builds a diagram-ref image skeleton and reads it back", () => {
    const sk = buildDiagramRefSkeleton({ fileId: "f1", diagramId: "D1", url: "/d/D1", x: 10, y: 20, width: 800, height: 600 }) as {
      type: string; fileId: string; link: string; customData: { type: string; diagramId: string };
    };
    expect(sk.type).toBe("image");
    expect(sk.fileId).toBe("f1");
    expect(sk.link).toBe("/d/D1");
    expect(sk.customData).toEqual({ type: "diagram-ref", diagramId: "D1" });
    expect(readDiagramRef({ customData: sk.customData, fileId: "f1" })).toEqual({ diagramId: "D1", fileId: "f1" });
  });
  it("readDiagramRef ignores non-ref elements", () => {
    expect(readDiagramRef({ customData: { type: "other" }, fileId: "x" })).toBeNull();
    expect(readDiagramRef({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run board-scene`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/board-scene.ts
export type BoardScene = {
  elements: unknown[];
  appState: { viewBackgroundColor: string };
  files: Record<string, unknown>;
};

const EMPTY: BoardScene = { elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} };

/** Serialize an Excalidraw scene to the stored JSON string. We persist `files`
 * ourselves because Excalidraw's own serializeAsJSON omits them. */
export function serializeBoard(
  elements: readonly unknown[],
  appState: { viewBackgroundColor?: string },
  files: Record<string, unknown>,
): string {
  return JSON.stringify({
    version: 1,
    source: "claril-board",
    elements,
    appState: { viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff" },
    files: files ?? {},
  });
}

/** Parse stored content back into Excalidraw initialData. Tolerant of empty or
 * malformed content (new boards / legacy rows) → empty scene. */
export function deserializeBoard(content: string): BoardScene {
  if (!content) return { ...EMPTY };
  try {
    const p = JSON.parse(content);
    return {
      elements: Array.isArray(p.elements) ? p.elements : [],
      appState: { viewBackgroundColor: p.appState?.viewBackgroundColor ?? "#ffffff" },
      files: p.files && typeof p.files === "object" ? p.files : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Excalidraw image-element skeleton for an embedded BPMN tile. Pass to
 * convertToExcalidrawElements(). Carries the ref link + customData. */
export function buildDiagramRefSkeleton(args: {
  fileId: string;
  diagramId: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    type: "image" as const,
    fileId: args.fileId,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    link: args.url,
    customData: { type: "diagram-ref", diagramId: args.diagramId },
  };
}

/** If an element is a diagram-ref tile, return its ids; else null. */
export function readDiagramRef(element: {
  customData?: { type?: string; diagramId?: string };
  fileId?: string;
}): { diagramId: string; fileId: string } | null {
  if (element.customData?.type === "diagram-ref" && element.customData.diagramId && element.fileId) {
    return { diagramId: element.customData.diagramId, fileId: element.fileId };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run board-scene`
Expected: PASS (4 tests).

- [ ] **Step 5: Switch BoardCanvas to the pure helpers**

In `board-canvas.tsx`, replace the inline `JSON.stringify({…})` in `handleChange` with `serializeBoard(elements, appState as { viewBackgroundColor?: string }, (files ?? {}) as Record<string, unknown>)`, and import `serializeBoard`/`deserializeBoard` from `@/lib/board-scene`. Keep `initialData` built from `deserializeBoard`.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck`

```bash
git add apps/web/lib/board-scene.ts apps/web/lib/board-scene.test.ts apps/web/components/board-canvas.tsx
git commit -m "feat(board): pure scene (de)serialize + diagram-ref element helpers"
```

---

## Phase 3 — BPMN embed

### Task 4: Referenced-BPMN → SVG data-URL (transient Viewer)

**Files:**
- Create: `apps/web/lib/board-svg.ts`

**Interfaces:**
- Produces: `async function renderBpmnToDataUrl(xml: string): Promise<string>` — returns an `image/svg+xml;base64` data URL; throws on invalid XML.

- [ ] **Step 1: Write the implementation** (no unit test — needs a real browser DOM/bpmn-js; verified by running the app in Task 5)

```ts
// apps/web/lib/board-svg.ts
import Viewer from "bpmn-js/lib/Viewer";

/** Headlessly render BPMN XML to an SVG data URL using a transient bpmn-js
 * Viewer. The viewer is attached off-screen before saveSVG() because a fully
 * detached SVG can getBBox()=0 in some engines, then destroyed. */
export async function renderBpmnToDataUrl(xml: string): Promise<string> {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "-9999px";
  host.style.top = "0";
  host.style.width = "1200px";
  host.style.height = "900px";
  document.body.appendChild(host);
  const viewer = new Viewer({ container: host });
  try {
    await viewer.importXML(xml);
    const { svg } = await viewer.saveSVG();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } finally {
    viewer.destroy();
    host.remove();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: clean. (bpmn-js has no type decls in some setups — if `Viewer` is `any`, mirror how `bpmn-canvas.tsx` imports/types the Modeler.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/board-svg.ts
git commit -m "feat(board): render referenced BPMN to SVG data-url via transient viewer"
```

---

### Task 5: Embed flow — pick a diagram, insert a live tile, refresh on open

**Files:**
- Create: `apps/web/lib/board-actions.ts` (`getEmbeddableDiagrams`, `getDiagramContentForEmbed`)
- Modify: `apps/web/components/board-canvas.tsx` (embed toolbar action, insert, refresh-on-open)

**Interfaces:**
- Consumes: `renderBpmnToDataUrl` (Task 4), `buildDiagramRefSkeleton`/`readDiagramRef` (Task 3), `convertToExcalidrawElements`, excalidraw API `addFiles`/`updateScene`/`getSceneElements`.
- Produces:
  - `getEmbeddableDiagrams(boardDiagramId: string): Promise<{ id: string; name: string; kind: string }[]>` — BPMN diagrams in the same project/scope as the board (excluding itself), access-gated.
  - `getDiagramContentForEmbed(diagramId: string): Promise<{ id: string; name: string; content: string; kind: string }>` — access-gated single-diagram read.

- [ ] **Step 1: Write the server actions**

```ts
// apps/web/lib/board-actions.ts
"use server";
import { and, eq, ne, isNull } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { requireUserId } from "@/lib/auth-helpers"; // match the helper used in actions.ts
import { assertDiagramAccess } from "@/lib/tenancy";  // match actions.ts import path

/** BPMN diagrams the user can embed on this board: same parent project/personal
 * project, not archived, not the board itself. Access-gated via the board. */
export async function getEmbeddableDiagrams(boardDiagramId: string) {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, boardDiagramId);
  const board = await db.query.diagram.findFirst({ where: eq(schema.diagram.id, boardDiagramId) });
  if (!board) return [];
  const sameParent = board.projectId
    ? eq(schema.diagram.projectId, board.projectId)
    : eq(schema.diagram.personalProjectId, board.personalProjectId!);
  const rows = await db
    .select({ id: schema.diagram.id, name: schema.diagram.name, kind: schema.diagram.type })
    .from(schema.diagram)
    .where(and(sameParent, ne(schema.diagram.id, boardDiagramId), eq(schema.diagram.type, "bpmn"), isNull(schema.diagram.archivedAt)));
  return rows;
}

/** Access-gated read of a single diagram's content, for embedding/refresh. */
export async function getDiagramContentForEmbed(diagramId: string) {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  const d = await db.query.diagram.findFirst({ where: eq(schema.diagram.id, diagramId) });
  if (!d) throw new Error("Diagram not found");
  return { id: d.id, name: d.name, content: d.content, kind: d.type };
}
```

(Confirm exact import paths for `requireUserId` + `assertDiagramAccess` against `apps/web/lib/actions.ts` — copy them verbatim.)

- [ ] **Step 2: Add embed + refresh to BoardCanvas**

Add to `board-canvas.tsx` (inside the component): capture the excalidraw API, an "Embed diagram" button rendered over the canvas, a picker (simple list from `getEmbeddableDiagrams`), an insert handler, and a refresh effect.

```tsx
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { buildDiagramRefSkeleton, readDiagramRef } from "@/lib/board-scene";
import { renderBpmnToDataUrl } from "@/lib/board-svg";
import { getEmbeddableDiagrams, getDiagramContentForEmbed } from "@/lib/board-actions";
// props now also need: diagramId: string (the board's own id)

const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

const insertEmbed = useCallback(async (targetDiagramId: string) => {
  if (!api) return;
  const { content } = await getDiagramContentForEmbed(targetDiagramId);
  const dataURL = await renderBpmnToDataUrl(content);
  const fileId = `bpmn-${crypto.randomUUID()}`;
  api.addFiles([{ id: fileId as never, dataURL: dataURL as never, mimeType: "image/svg+xml", created: Date.now() }]);
  const [el] = convertToExcalidrawElements([
    buildDiagramRefSkeleton({ fileId, diagramId: targetDiagramId, url: `/d/${targetDiagramId}`, x: 120, y: 120, width: 800, height: 600 }) as never,
  ]);
  api.updateScene({ elements: [...api.getSceneElements(), el] });
}, [api]);

// Refresh every diagram-ref tile from its current BPMN when the board mounts.
useEffect(() => {
  if (!api) return;
  let cancelled = false;
  (async () => {
    const refs = api.getSceneElements().map((e) => readDiagramRef(e as never)).filter(Boolean) as { diagramId: string; fileId: string }[];
    for (const ref of refs) {
      try {
        const { content } = await getDiagramContentForEmbed(ref.diagramId);
        const dataURL = await renderBpmnToDataUrl(content);
        if (cancelled) return;
        api.addFiles([{ id: ref.fileId as never, dataURL: dataURL as never, mimeType: "image/svg+xml", created: Date.now() }]);
      } catch { /* diagram deleted/inaccessible — leave the stale tile */ }
    }
    if (!cancelled) api.updateScene({ elements: api.getSceneElements() }); // force re-render of refreshed files
  })();
  return () => { cancelled = true; };
}, [api]);
```

Wire the API via `excalidrawAPI={(a) => setApi(a)}` on `<Excalidraw>`, add a small floating "Embed diagram" button + picker (use existing shadcn `Button`/`Popover`/`Command` — mirror `command-bar.tsx`), and thread the board's own `diagramId` down from `BoardWorkbench` into `BoardCanvas` props.

- [ ] **Step 3: Verify by running the app**

Run `pnpm --filter web dev`. On a board, click "Embed diagram" → pick a BPMN → a tile of its current diagram appears; clicking the tile's link opens `/d/<bpmnId>`; editing the BPMN and reopening the board shows the updated tile; reload persists the tile.
Expected: embed + live-refresh + open-link all work. Also `pnpm --filter web build` compiles.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/board-actions.ts apps/web/components/board-canvas.tsx apps/web/components/board-workbench.tsx
git commit -m "feat(board): embed live BPMN reference tiles (pick, insert, refresh-on-open, open-link)"
```

---

## Phase 4 — Related panel + AI

### Task 6: Deterministic relations (pure grouping + server action)

**Files:**
- Create: `apps/web/lib/related.ts` (pure `groupRelationsByAsset`)
- Modify: `apps/web/lib/board-actions.ts` (`getRelatedForDiagram`)
- Test: `apps/web/lib/related.test.ts`

**Interfaces:**
- Produces:
  - `type RelationRow = { assetId: string; assetName: string; diagramId: string; diagramName: string; diagramKind: string; elementId: string }`
  - `type RelatedGroup = { asset: { id: string; name: string }; relatedDiagrams: { id: string; name: string; kind: string; elementIds: string[] }[] }`
  - `groupRelationsByAsset(rows: RelationRow[], sourceDiagramId: string): RelatedGroup[]` — groups by asset, EXCLUDES the source diagram, de-dups diagrams and collects their elementIds.
  - `getRelatedForDiagram(diagramId: string): Promise<RelatedGroup[]>` (server, org-scoped; `[]` for personal/no-bindings).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/related.test.ts
import { describe, expect, it } from "vitest";
import { groupRelationsByAsset, type RelationRow } from "./related";

const rows: RelationRow[] = [
  { assetId: "A", assetName: "Payment Service", diagramId: "SRC", diagramName: "Checkout BPMN", diagramKind: "bpmn", elementId: "e1" },
  { assetId: "A", assetName: "Payment Service", diagramId: "C4", diagramName: "Billing", diagramKind: "c4", elementId: "c1" },
  { assetId: "A", assetName: "Payment Service", diagramId: "C4", diagramName: "Billing", diagramKind: "c4", elementId: "c2" },
  { assetId: "B", assetName: "User Mgmt", diagramId: "SEQ", diagramName: "Login", diagramKind: "sequence", elementId: "s1" },
];

describe("groupRelationsByAsset", () => {
  it("groups by asset, excludes the source diagram, de-dups diagrams + collects elementIds", () => {
    const g = groupRelationsByAsset(rows, "SRC");
    const payment = g.find((x) => x.asset.id === "A")!;
    expect(payment.relatedDiagrams).toEqual([{ id: "C4", name: "Billing", kind: "c4", elementIds: ["c1", "c2"] }]);
  });
  it("drops assets whose only binding is the source diagram", () => {
    const g = groupRelationsByAsset(rows.filter((r) => r.assetId === "A" && r.diagramId === "SRC"), "SRC");
    expect(g).toEqual([]);
  });
  it("includes assets bound only in other diagrams (asset B)", () => {
    const g = groupRelationsByAsset(rows, "SRC");
    expect(g.find((x) => x.asset.id === "B")?.relatedDiagrams[0].id).toBe("SEQ");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run related`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure grouping**

```ts
// apps/web/lib/related.ts
export type RelationRow = {
  assetId: string; assetName: string;
  diagramId: string; diagramName: string; diagramKind: string; elementId: string;
};
export type RelatedGroup = {
  asset: { id: string; name: string };
  relatedDiagrams: { id: string; name: string; kind: string; elementIds: string[] }[];
};

/** Group binding rows by asset, excluding the source diagram; de-dup related
 * diagrams and collect their element ids. Assets with no related (non-source)
 * diagram are dropped. Pure. */
export function groupRelationsByAsset(rows: RelationRow[], sourceDiagramId: string): RelatedGroup[] {
  const byAsset = new Map<string, RelatedGroup>();
  for (const r of rows) {
    if (r.diagramId === sourceDiagramId) continue;
    let g = byAsset.get(r.assetId);
    if (!g) { g = { asset: { id: r.assetId, name: r.assetName }, relatedDiagrams: [] }; byAsset.set(r.assetId, g); }
    let d = g.relatedDiagrams.find((x) => x.id === r.diagramId);
    if (!d) { d = { id: r.diagramId, name: r.diagramName, kind: r.diagramKind, elementIds: [] }; g.relatedDiagrams.push(d); }
    if (!d.elementIds.includes(r.elementId)) d.elementIds.push(r.elementId);
  }
  return [...byAsset.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run related`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the server action**

In `apps/web/lib/board-actions.ts`:
```ts
import { inArray } from "drizzle-orm";
import { groupRelationsByAsset, type RelationRow, type RelatedGroup } from "@/lib/related";
import { diagramContext } from "@/lib/context"; // match actions.ts resolveAiContext usage

/** Related diagrams by shared catalog asset. Org-scoped; [] for personal or no bindings. */
export async function getRelatedForDiagram(diagramId: string): Promise<RelatedGroup[]> {
  const userId = await requireUserId();
  const { ctx, orgId } = await diagramContext(userId, diagramId);
  if (ctx.kind !== "org" || !orgId) return []; // assets are org-only
  // 1. assets bound in this diagram
  const mine = await db
    .select({ assetId: schema.elementAssetBinding.assetId })
    .from(schema.elementAssetBinding)
    .where(and(eq(schema.elementAssetBinding.diagramId, diagramId), eq(schema.elementAssetBinding.organizationId, orgId)));
  const assetIds = [...new Set(mine.map((m) => m.assetId))];
  if (assetIds.length === 0) return [];
  // 2. all bindings of those assets across diagrams, with names/kinds
  const rows = await db
    .select({
      assetId: schema.elementAssetBinding.assetId,
      assetName: schema.asset.name,
      diagramId: schema.elementAssetBinding.diagramId,
      diagramName: schema.diagram.name,
      diagramKind: schema.diagram.type,
      elementId: schema.elementAssetBinding.elementId,
    })
    .from(schema.elementAssetBinding)
    .innerJoin(schema.asset, eq(schema.elementAssetBinding.assetId, schema.asset.id))
    .innerJoin(schema.diagram, eq(schema.elementAssetBinding.diagramId, schema.diagram.id))
    .where(and(eq(schema.elementAssetBinding.organizationId, orgId), inArray(schema.elementAssetBinding.assetId, assetIds)));
  return groupRelationsByAsset(rows as RelationRow[], diagramId);
}
```

(Confirm `diagramContext` import path + return shape against `actions.ts:451-453`.)

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck`

```bash
git add apps/web/lib/related.ts apps/web/lib/related.test.ts apps/web/lib/board-actions.ts
git commit -m "feat(board): deterministic related-across-diagrams via asset bindings"
```

---

### Task 7: AI narrative (`summarizeRelations`)

**Files:**
- Create: `packages/ai-advisor/src/relations.ts`
- Modify: `packages/ai-advisor/src/index.ts` (export)
- Modify: `apps/web/lib/board-actions.ts` (`summarizeRelations` action)
- Modify: `apps/web/lib/related.ts` (add pure `buildRelationsPrompt`)
- Test: `apps/web/lib/related.test.ts` (add prompt test)

**Interfaces:**
- Produces:
  - `buildRelationsPrompt(sourceName: string, groups: RelatedGroup[]): string` (pure)
  - `summarizeRelationsWithUsage(input: { prompt: string }, config: LLMProviderConfig): Promise<{ value: string; usage: LanguageModelUsage }>`
  - `summarizeRelations(diagramId: string): Promise<{ text: string } | null>` (server; `null` if AI not configured or no relations)

- [ ] **Step 1: Write the failing prompt test** (append to `related.test.ts`)

```ts
import { buildRelationsPrompt } from "./related";
it("buildRelationsPrompt lists only the given relations (no invention)", () => {
  const p = buildRelationsPrompt("Checkout BPMN", [
    { asset: { id: "A", name: "Payment Service" }, relatedDiagrams: [{ id: "C4", name: "Billing", kind: "c4", elementIds: ["c1"] }] },
  ]);
  expect(p).toContain("Checkout BPMN");
  expect(p).toContain("Payment Service");
  expect(p).toContain("Billing");
  expect(p).toContain("c4");
  expect(p.toLowerCase()).toContain("only the relationships listed"); // grounding guard phrase
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run related`
Expected: FAIL — `buildRelationsPrompt` not exported.

- [ ] **Step 3: Write the pure prompt builder** (in `related.ts`)

```ts
/** Build the grounding prompt for the AI relation narrative. The model must
 * narrate ONLY the listed relations — never invent. Pure. */
export function buildRelationsPrompt(sourceName: string, groups: RelatedGroup[]): string {
  const lines = groups.map(
    (g) => `- ${g.asset.name}: also used in ${g.relatedDiagrams.map((d) => `"${d.name}" (${d.kind})`).join(", ")}`,
  );
  return [
    `The current diagram is "${sourceName}". Its catalog assets also appear in other diagrams:`,
    ...lines,
    "",
    "Write 2-3 sentences reminding the architect of these cross-diagram connections and why they might matter (shared services, consistency, impact). Mention ONLY the relationships listed above — do not invent any others. Be concise and concrete.",
  ].join("\n");
}
```

- [ ] **Step 4: Write the advisor module** (mirror `docgen.ts`)

```ts
// packages/ai-advisor/src/relations.ts
import { generateText, type LanguageModelUsage } from "ai";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";

const RELATIONS_SYSTEM_PROMPT =
  "You are Claril's architecture-memory assistant. You remind architects of real cross-diagram connections between their models. Narrate only the relationships you are given; never invent connections.";

export async function summarizeRelationsWithUsage(
  input: { prompt: string },
  config: LLMProviderConfig,
): Promise<{ value: string; usage: LanguageModelUsage }> {
  const { text, usage } = await generateText({
    model: createModel(config),
    system: RELATIONS_SYSTEM_PROMPT,
    prompt: input.prompt,
  });
  return { value: text.trim(), usage };
}
```

Export it from `packages/ai-advisor/src/index.ts`:
```ts
export { summarizeRelationsWithUsage } from "./relations";
```

- [ ] **Step 5: Write the server action** (in `board-actions.ts`, mirror `runDocGen`)

```ts
import { getAiConfig } from "@/lib/ai";
import { getActiveContext } from "@/lib/context";
import { buildRelationsPrompt } from "@/lib/related";
import { summarizeRelationsWithUsage } from "@claril/ai-advisor";
import { recordAiUsage } from "@/lib/ai-usage"; // match runDocGen's import

/** AI narrative over the deterministic relations. null if no relations or no AI. */
export async function summarizeRelations(diagramId: string): Promise<{ text: string } | null> {
  const userId = await requireUserId();
  const groups = await getRelatedForDiagram(diagramId);
  if (groups.length === 0) return null;
  const { ctx, orgId } = await diagramContext(userId, diagramId);
  const config = await getAiConfig(ctx);
  if (!config) return null; // graceful degrade — caller shows the list only
  const d = await db.query.diagram.findFirst({ where: eq(schema.diagram.id, diagramId) });
  const { value, usage } = await summarizeRelationsWithUsage(
    { prompt: buildRelationsPrompt(d?.name ?? "this diagram", groups) },
    config,
  );
  await recordAiUsage({ organizationId: orgId, diagramId, kind: "advisor", provider: config.provider, model: config.model, usage });
  return { text: value };
}
```

(Confirm `recordAiUsage` signature + import + the `getAiConfig`/`diagramContext` shapes against `actions.ts` `runDocGen`/`resolveAiContext`. Reuse usage kind `"advisor"`.)

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/web && npx vitest run related` → PASS (4 tests). Then `pnpm typecheck` (incl. `@claril/ai-advisor`).

- [ ] **Step 7: Commit**

```bash
git add packages/ai-advisor/src/relations.ts packages/ai-advisor/src/index.ts apps/web/lib/related.ts apps/web/lib/related.test.ts apps/web/lib/board-actions.ts
git commit -m "feat(board): AI narrative for related diagrams (grounded on deterministic links)"
```

---

### Task 8: RelatedPanel UI

**Files:**
- Create: `apps/web/components/related-panel.tsx`
- Modify: `apps/web/components/board-canvas.tsx` (open the panel from a selected diagram-ref tile)

**Interfaces:**
- Consumes: `getRelatedForDiagram`, `summarizeRelations` (Task 6/7), `readDiagramRef` (Task 3), `RelatedGroup` type.
- Produces: `<RelatedPanel diagramId onClose />` (client); opened when a `diagram-ref` tile is selected and the user clicks "Related".

- [ ] **Step 1: Write the panel**

```tsx
// apps/web/components/related-panel.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getRelatedForDiagram, summarizeRelations } from "@/lib/board-actions";
import type { RelatedGroup } from "@/lib/related";

export function RelatedPanel({ diagramId, onClose }: { diagramId: string; onClose: () => void }) {
  const [groups, setGroups] = useState<RelatedGroup[] | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "off">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const g = await getRelatedForDiagram(diagramId);
      if (cancelled) return;
      setGroups(g);
      if (g.length === 0) return;
      setAiState("loading");
      try {
        const r = await summarizeRelations(diagramId);
        if (!cancelled) { setNarrative(r?.text ?? null); setAiState(r ? "idle" : "off"); }
      } catch { if (!cancelled) setAiState("off"); }
    })();
    return () => { cancelled = true; };
  }, [diagramId]);

  return (
    <aside className="absolute right-0 top-[58px] z-30 h-[calc(100%-58px)] w-80 overflow-auto border-l border-hairline bg-panel p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Related across diagrams</h2>
        <button onClick={onClose} aria-label="Close" className="touch-target text-fg-muted">✕</button>
      </div>
      {groups === null && <p className="text-fg-muted">Loading…</p>}
      {groups?.length === 0 && (
        <p className="text-fg-muted">No cross-diagram links yet. Bind this diagram's elements to catalog assets (organization scope) to see related diagrams.</p>
      )}
      {narrative && <p className="mb-4 rounded-md bg-elevated p-3 text-fg">{narrative}</p>}
      {aiState === "loading" && <p className="mb-4 text-fg-muted">Summarizing…</p>}
      {groups?.map((g) => (
        <div key={g.asset.id} className="mb-3">
          <div className="font-medium">{g.asset.name}</div>
          <ul className="ml-3 list-disc">
            {g.relatedDiagrams.map((d) => (
              <li key={d.id}><Link className="text-accent hover:underline" href={`/d/${d.id}`}>{d.name}</Link> <span className="text-fg-muted">({d.kind})</span></li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
```

- [ ] **Step 2: Open it from a selected tile (board-canvas.tsx)**

Track Excalidraw selection (via `onChange`'s `appState.selectedElementIds` or `api.getAppState()`); when exactly one selected element is a `diagram-ref` (`readDiagramRef`), show a floating "Related" button; clicking it sets `relatedFor = <that tile's diagramId>` and renders `<RelatedPanel diagramId={relatedFor} onClose={() => setRelatedFor(null)} />`. (Selecting the tile's referenced diagram id is what the panel queries — that's the embedded BPMN whose assets we relate.)

- [ ] **Step 3: Verify by running the app**

With an org diagram whose elements are bound to catalog assets also used elsewhere: embed it on a board, select the tile, click "Related" → the panel lists the other diagrams (clickable) and, if AI is connected, a 2-3 sentence narrative; with AI off, the list still shows; a board with no bindings shows the empty-state hint. `pnpm --filter web build` compiles.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/related-panel.tsx apps/web/components/board-canvas.tsx
git commit -m "feat(board): Related-across-diagrams panel (list + AI narrative + graceful degrade)"
```

---

## Phase 5 — Guard & verify

### Task 9: Dispatch guard test + final verification

**Files:**
- Create: `apps/web/components/workbench.test.ts`

**Interfaces:** none (test only).

- [ ] **Step 1: Write a dispatch guard test**

Since `workbench.tsx` renders heavy client components, test the *routing decision* via a small extracted pure helper OR assert the mapping table. Simplest robust approach: extract the kind→component choice is overkill; instead assert the enum/kind wiring is intact with a lightweight test that imports `DiagramKind` seeds and confirms `board` is handled while the others are unchanged:

```ts
// apps/web/components/workbench.test.ts
import { describe, expect, it } from "vitest";
import { seedForKind, defaultNameForKind, type DiagramKind } from "@/lib/default-diagram";

describe("diagram kinds remain intact (dispatch guard)", () => {
  it("every kind has a seed + name, board included, others unchanged", () => {
    const kinds: DiagramKind[] = ["bpmn", "sequence", "c4", "board"];
    for (const k of kinds) {
      expect(typeof seedForKind(k)).toBe("string");
      expect(seedForKind(k).length).toBeGreaterThan(0);
      expect(defaultNameForKind(k)).toMatch(/\w/);
    }
    expect(defaultNameForKind("bpmn")).toBe("Untitled process");
    expect(defaultNameForKind("board")).toBe("Untitled board");
    expect(() => JSON.parse(seedForKind("board"))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the full suite + typecheck + build**

Run: `pnpm --filter web test` (all pass, incl. the new board tests), `pnpm typecheck` (8 pkgs clean), `pnpm --filter web build` (compiles).
Expected: green.

- [ ] **Step 3: Manual end-to-end verification** (the real acceptance)

Confirm the slice's aha on a running app:
1. Create a `board`; draw/sticky-note freely (Excalidraw works, autosaves, reloads).
2. Embed an existing BPMN → live tile; edit that BPMN → reopen board → tile reflects the change; tile link opens the BPMN editor.
3. On an org board with asset-bound diagrams, select the tile → "Related" panel lists other diagrams binding the same assets + an AI narrative (AI on) / list-only (AI off); empty-state otherwise.
4. Existing BPMN/Sequence/C4 diagrams open and behave exactly as before.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/workbench.test.ts
git commit -m "test(board): dispatch guard — all diagram kinds intact"
```

---

## Self-Review

**Spec coverage:**
- New `board` kind (enum, migration, kind model) → Task 1. ✓
- Board editor behind dispatch, standing alone (TopBar + autosave) → Task 2. ✓
- Excalidraw canvas + scene persistence → Tasks 2–3. ✓
- Live-refreshing BPMN embed tile (SVG via transient Viewer, customData+link, refresh-on-open, open) → Tasks 4–5. ✓
- Cross-artifact relations via asset bindings (pure grouping + org-scoped action, personal → empty) → Task 6. ✓
- AI narrative grounded strictly on the deterministic list (graceful degrade) → Task 7. ✓
- Related panel UI → Task 8. ✓
- Additive/non-regressing + dispatch guard → Task 9. ✓
- Out-of-scope items are not built. ✓

**Placeholder scan:** No TBD/TODO. The few "confirm import path against actions.ts" notes are concrete verify-the-exact-symbol steps (the code is complete; only the import specifier may differ) — acceptable, each names the exact file to copy from. Task 2's note about Task 3 ordering is a real sequencing instruction, not a gap.

**Type consistency:** `DiagramKind` extended once (Task 1) and used in Tasks 2/9; `serializeBoard`/`deserializeBoard`/`buildDiagramRefSkeleton`/`readDiagramRef` signatures match between Task 3 and their consumers (Tasks 2/5/8); `RelationRow`/`RelatedGroup`/`groupRelationsByAsset`/`buildRelationsPrompt` consistent across Tasks 6–8; `getRelatedForDiagram`/`summarizeRelations`/`getEmbeddableDiagrams`/`getDiagramContentForEmbed` signatures stable between definition and use.

**Risks carried from spec:** exact repo import specifiers (`requireUserId`, `assertDiagramAccess`, `diagramContext`, `recordAiUsage`, `getAiConfig`) confirmed live against `actions.ts` during Tasks 5–7; the enum-migration mechanics (meta/_journal registration) confirmed against `0010` during Task 1; bpmn-js `Viewer` SVG export verified on-device during Task 5.
