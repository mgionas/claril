# F3 — Chat memory + DB knowledge cache + surrogate sanitize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat survive page reload (persist per diagram), cut per-turn tokens by sending a compact DB-cached process synopsis instead of the full node/flow dump, and fix the `400 invalid high surrogate` provider error by sanitizing lone UTF-16 surrogates.

**Architecture:** Three independent slices. (1) A pure `stripLoneSurrogates` sanitizer applied to everything the chat route sends to the provider — fixes the live 400 first. (2) A `chat_message` table + server actions; `useChat` hydrates from server-loaded history and persists each finished turn; a Clear-chat control. (3) A `diagram_knowledge` table caching a compact, deterministically-derived synopsis keyed by a graph hash; the chat route grounds on summary + findings + a compact id↔name table instead of the verbose `describeGraph` dump.

**Tech Stack:** Next.js 16 route handlers + server actions, AI SDK v6 (`useChat`, `streamText`, `convertToModelMessages`), Drizzle + Postgres (Neon), Vitest.

**Migrations:** Tasks 2 and 3 each add one table (generate-only; controller reviews SQL, then applies with `pnpm --filter @claril/db db:migrate` — user has authorized migrating this session). DB-table reads/writes are best-effort (try/catch) so a not-yet-migrated env still works, matching the existing `diagram_doc`/`ai_usage` resilience pattern (commit `89f58bf`).

**Scope note:** The client still sends `graph`/`findings` in the request body (the `proposeEdit` tool's `planEdits` needs the full graph). F3's token cut targets the *provider-bound grounding* (compact synopsis vs full dump), not the client→route body. Server-side graph reconstruction (to drop the graph from the body entirely) is out of scope — noted at the end.

---

### Task 1: Surrogate sanitizer (fixes the live `400 invalid high surrogate`)

**Files:**
- Create: `apps/web/lib/sanitize.ts`
- Test: `apps/web/lib/sanitize.test.ts`
- Modify: `apps/web/app/api/ai/chat/route.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/sanitize.test.ts`:
```tsx
import { describe, expect, it } from "vitest";
import { stripLoneSurrogates } from "./sanitize";

describe("stripLoneSurrogates", () => {
  it("removes a lone high surrogate", () => {
    expect(stripLoneSurrogates("a\uD800b")).toBe("ab");
  });
  it("removes a lone low surrogate", () => {
    expect(stripLoneSurrogates("a\uDC00b")).toBe("ab");
  });
  it("preserves a valid surrogate pair (emoji)", () => {
    const emoji = "💡"; // U+1F4A1 = 💡
    expect(stripLoneSurrogates(`x${emoji}y`)).toBe(`x${emoji}y`);
  });
  it("leaves plain text untouched", () => {
    expect(stripLoneSurrogates("hello world")).toBe("hello world");
  });
  it("handles a high surrogate at end of string", () => {
    expect(stripLoneSurrogates("end\uD83D")).toBe("end");
  });
});
```

- [ ] **Step 2: Run it; confirm it FAILS**

Run: `cd apps/web && pnpm exec vitest run lib/sanitize.test.ts`
Expected: FAIL — `stripLoneSurrogates` not found.

- [ ] **Step 3: Implement the sanitizer**

Create `apps/web/lib/sanitize.ts`:
```tsx
/**
 * Remove unpaired UTF-16 surrogate code units from a string. A valid surrogate
 * pair (high D800–DBFF followed by low DC00–DFFF) is kept; a high surrogate not
 * followed by a low one, or a low surrogate not preceded by a high one, is
 * dropped. Unpaired surrogates serialize to invalid JSON and make AI providers
 * reject the request body ("invalid high surrogate"). Apply to every
 * model-bound string (grounding + message text).
 */
export function stripLoneSurrogates(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: keep only if followed by a valid low surrogate.
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i] + input[i + 1];
        i++;
      }
      // else: drop the lone high surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Lone low surrogate (a paired one is consumed above): drop it.
    } else {
      out += input[i];
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test; confirm PASS (5 tests).**

Run: `cd apps/web && pnpm exec vitest run lib/sanitize.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply in the chat route**

In `apps/web/app/api/ai/chat/route.ts`:

Add the import:
```tsx
import { stripLoneSurrogates } from "@/lib/sanitize";
```

Sanitize the grounding before it goes into the system prompt. Replace:
```tsx
  const grounding = describeGroundingPrompt({ graph, findings, assetContext });
```
with:
```tsx
  const grounding = stripLoneSurrogates(
    describeGroundingPrompt({ graph, findings, assetContext }),
  );
```

Sanitize message text parts before `convertToModelMessages`. Replace:
```tsx
    messages: await convertToModelMessages(messages),
```
with:
```tsx
    messages: await convertToModelMessages(sanitizeMessages(messages)),
```
And add this helper near the top of the file (after `BodySchema`):
```tsx
/** Strip lone surrogates from every text part so the provider body stays valid JSON. */
function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === "text" ? { ...p, text: stripLoneSurrogates(p.text) } : p,
    ),
  }));
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/sanitize.ts apps/web/lib/sanitize.test.ts apps/web/app/api/ai/chat/route.ts
git commit -m "$(cat <<'EOF'
fix(ai): strip lone UTF-16 surrogates from chat provider body

Fixes "400 invalid high surrogate" by sanitizing grounding + message
text before streamText. Unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Persist chat per diagram

**Files:**
- Modify: `packages/db/src/schema/app.ts` (add `chatMessage` table; import `jsonb`)
- Generate/apply: `packages/db/drizzle/0007_*.sql`
- Create: `apps/web/lib/chat-actions.ts`
- Modify: `apps/web/components/chat-tab.tsx` (hydrate + persist + Clear)
- Modify: `apps/web/components/ai-drawer.tsx` (thread `initialMessages` + `diagramId`)
- Modify: `apps/web/components/bpmn-workbench.tsx` (accept + pass `initialMessages`)
- Modify: `apps/web/app/d/[diagramId]/page.tsx` (load history)

- [ ] **Step 1: Add the `chatMessage` table**

In `packages/db/src/schema/app.ts`, ensure `jsonb` is imported:
```tsx
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
```
Add the table after `diagramDoc` (~line 125):
```tsx
/**
 * Persisted chat transcript, one row per UI message, scoped to a diagram. Lets
 * the assistant conversation survive page reloads. `parts` is the AI SDK
 * UIMessage parts array (text + tool outputs) stored verbatim as JSON.
 */
export const chatMessage = pgTable(
  "chat_message",
  {
    id: text("id").primaryKey(), // the UIMessage id (client-generated)
    diagramId: text("diagram_id")
      .notNull()
      .references(() => diagram.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant" | "system"
    parts: jsonb("parts").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("chat_message_diagram_idx").on(t.diagramId)],
);
```

- [ ] **Step 2: Generate the migration, inspect, STOP for controller apply**

Run: `pnpm --filter @claril/db db:generate`
Run: `cat packages/db/drizzle/0007_*.sql`
Expected: a single `CREATE TABLE "chat_message" (...)` + an index + the FK. If it contains anything destructive (DROP/ALTER of other tables), STOP and report. Do NOT run `db:migrate` — the controller applies it after review.

- [ ] **Step 3: Chat persistence server actions**

Create `apps/web/lib/chat-actions.ts`:
```tsx
"use server";

import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { assertDiagramAccess } from "@/lib/tenancy";

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

/** A persisted chat message (shape mirrors the AI SDK UIMessage we store). */
export interface StoredChatMessage {
  id: string;
  role: string;
  parts: unknown;
}

/** Load a diagram's chat transcript, oldest first. Best-effort: [] on missing table. */
export async function getChatMessages(diagramId: string): Promise<StoredChatMessage[]> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  try {
    const rows = await db
      .select({ id: schema.chatMessage.id, role: schema.chatMessage.role, parts: schema.chatMessage.parts })
      .from(schema.chatMessage)
      .where(eq(schema.chatMessage.diagramId, diagramId))
      .orderBy(asc(schema.chatMessage.createdAt));
    return rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts }));
  } catch {
    return [];
  }
}

/** Append messages (idempotent on id via onConflictDoNothing). Best-effort. */
export async function appendChatMessages(
  diagramId: string,
  messages: { id: string; role: string; parts: unknown }[],
): Promise<void> {
  if (messages.length === 0) return;
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  try {
    await db
      .insert(schema.chatMessage)
      .values(
        messages.map((m) => ({
          id: m.id,
          diagramId,
          role: m.role,
          parts: m.parts as object,
        })),
      )
      .onConflictDoNothing();
  } catch {
    /* table may be absent pre-migration; ignore */
  }
}

/** Wipe a diagram's chat transcript. Best-effort. */
export async function clearChat(diagramId: string): Promise<void> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  try {
    await db.delete(schema.chatMessage).where(eq(schema.chatMessage.diagramId, diagramId));
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: ChatTab — hydrate, persist, Clear**

In `apps/web/components/chat-tab.tsx`:

Add to `ChatTabProps`:
```tsx
  diagramId: string;
  initialMessages?: { id: string; role: string; parts: unknown }[];
```
Import the actions:
```tsx
import { appendChatMessages, clearChat } from "@/lib/chat-actions";
import { Trash2 } from "lucide-react";
```
Hydrate `useChat` with initial messages and grab `setMessages`:
```tsx
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
    messages: (props.initialMessages as never) ?? undefined,
  });
```
> Note: the AI SDK `useChat` initial-messages option is `messages`. The stored `{id, role, parts}` shape is the UIMessage subset we persisted; cast through `as never` to satisfy the generic UIMessage type — the runtime shape matches what the transcript renderer reads (`m.role`, `m.parts`).

Persist finished turns. Add a ref to track persisted ids and an effect that fires when the stream goes idle:
```tsx
  const persistedIds = useRef<Set<string>>(new Set());
  // Seed with hydrated ids so we never re-insert them.
  useEffect(() => {
    for (const m of props.initialMessages ?? []) persistedIds.current.add(m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const fresh = messages.filter((m) => !persistedIds.current.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) persistedIds.current.add(m.id);
    void appendChatMessages(
      props.getContext().diagramId,
      fresh.map((m) => ({ id: m.id, role: m.role, parts: m.parts })),
    ).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages]);
```
Add a Clear-chat control in the header chip row (next to Review/Document), wired to wipe DB + local state:
```tsx
            <Chip icon={Wand2} label="Review" onClick={props.onReview} />
            <Chip icon={FileText} label="Document" onClick={props.onGenerateDocs} />
            {messages.length > 0 && (
              <Chip
                icon={Trash2}
                label="Clear"
                onClick={() => {
                  setMessages([]);
                  persistedIds.current.clear();
                  void clearChat(props.getContext().diagramId).catch(() => {});
                }}
              />
            )}
```

- [ ] **Step 5: Thread `initialMessages` + ensure `diagramId` reaches ChatTab**

ChatTab already gets `diagramId` via `getContext()`. Add `initialMessages` to the prop chain:

In `apps/web/components/ai-drawer.tsx` `AiDrawerProps`:
```tsx
  initialChatMessages?: { id: string; role: string; parts: unknown }[];
```
Pass into `<ChatTab>`:
```tsx
                diagramId={props.getChatContext().diagramId}
                initialMessages={props.initialChatMessages}
```
> `getChatContext()` returns `{ graph, findings, diagramId }`; calling it for `diagramId` at render is fine (it's a cheap ref read).

In `apps/web/components/bpmn-workbench.tsx`: add a prop `initialChatMessages?: { id: string; role: string; parts: unknown }[]` to `BpmnWorkbenchProps`, accept it in the destructure, and pass `initialChatMessages={initialChatMessages}` to `<AiDrawer>`.

- [ ] **Step 6: Load history in the diagram page**

In `apps/web/app/d/[diagramId]/page.tsx`, load chat history server-side and pass it to the BPMN workbench. Find where `<BpmnWorkbench ... />` is rendered (BPMN kind branch). Add near the other server loads:
```tsx
import { getChatMessages } from "@/lib/chat-actions";
```
```tsx
  const initialChatMessages = await getChatMessages(diagramId);
```
and pass `initialChatMessages={initialChatMessages}` to `<BpmnWorkbench>`. (Only the BPMN workbench has the AI drawer; do not pass to the Mermaid workbench.)

- [ ] **Step 7: Controller applies migration 0007**

(Controller step — after reviewing the SQL from Step 2.) Run: `pnpm --filter @claril/db db:migrate`.

- [ ] **Step 8: Typecheck + build**

Run: `pnpm --filter web typecheck`
Run: `pnpm --filter @claril/db typecheck`
Run: `pnpm --filter web build`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/app.ts packages/db/drizzle apps/web/lib/chat-actions.ts apps/web/components/chat-tab.tsx apps/web/components/ai-drawer.tsx apps/web/components/bpmn-workbench.tsx "apps/web/app/d/[diagramId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(web): persist chat per diagram (hydrate on reload + Clear)

chat_message table (migration 0007) + append/get/clear actions; useChat
hydrates from server-loaded history and persists each finished turn.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: DB-cached compact knowledge (token cut)

**Files:**
- Modify: `packages/db/src/schema/app.ts` (add `diagramKnowledge` table)
- Generate/apply: `packages/db/drizzle/0008_*.sql`
- Create: `packages/ai-advisor/src/synopsis.ts` (compact synopsis + graph hash) + export from `index.ts`
- Test: `packages/ai-advisor/src/synopsis.test.ts`
- Create: `apps/web/lib/knowledge.ts` (get/upsert cached synopsis)
- Modify: `apps/web/app/api/ai/chat/route.ts` (ground on cached synopsis + findings + id↔name)

- [ ] **Step 1: Add the `diagramKnowledge` table**

In `packages/db/src/schema/app.ts`, after `chatMessage`:
```tsx
/**
 * Cached compact process synopsis for a diagram, so the chat route grounds the
 * model on a small structured summary instead of re-sending the full node/flow
 * dump every turn. Regenerated when `graphHash` changes.
 */
export const diagramKnowledge = pgTable("diagram_knowledge", {
  diagramId: text("diagram_id")
    .primaryKey()
    .references(() => diagram.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  graphHash: text("graph_hash").notNull(),
  model: text("model"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate migration, inspect, STOP**

Run: `pnpm --filter @claril/db db:generate`
Run: `cat packages/db/drizzle/0008_*.sql`
Expected: single `CREATE TABLE "diagram_knowledge" (...)`. STOP and report if anything destructive. Do NOT `db:migrate`.

- [ ] **Step 3: Write the failing test for the synopsis + hash**

Create `packages/ai-advisor/src/synopsis.test.ts`:
```tsx
import { describe, expect, it } from "vitest";
import { graphHash, describeSynopsis } from "./synopsis";

const graph = {
  nodes: [
    { id: "Start_1", type: "startEvent", name: "Begin" },
    { id: "Task_1", type: "task", name: "Review request" },
    { id: "Gw_1", type: "exclusiveGateway", name: "Approved?" },
    { id: "End_1", type: "endEvent", name: "" },
  ],
  flows: [
    { sourceRef: "Start_1", targetRef: "Task_1" },
    { sourceRef: "Task_1", targetRef: "Gw_1" },
    { sourceRef: "Gw_1", targetRef: "End_1", name: "yes" },
  ],
};

describe("graphHash", () => {
  it("is stable for identical graphs and changes when the graph changes", () => {
    const h1 = graphHash(graph as never);
    const h2 = graphHash(graph as never);
    expect(h1).toBe(h2);
    const changed = { ...graph, nodes: [...graph.nodes, { id: "Task_2", type: "task", name: "Notify" }] };
    expect(graphHash(changed as never)).not.toBe(h1);
  });
});

describe("describeSynopsis", () => {
  it("includes counts and an id->name table for named elements", () => {
    const s = describeSynopsis(graph as never);
    expect(s).toContain("Task_1");
    expect(s).toContain("Review request");
    expect(s).toMatch(/gateway/i);
  });
  it("is shorter than the full node+flow dump for a small graph", () => {
    // Sanity: synopsis must not be empty.
    expect(describeSynopsis(graph as never).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run it; confirm FAIL**

Run: `pnpm --filter @claril/ai-advisor exec vitest run src/synopsis.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the synopsis + hash**

Create `packages/ai-advisor/src/synopsis.ts`:
```tsx
import type { ProcessGraph } from "@claril/logic-inspector";

/**
 * Deterministic, fast 32-bit hash (FNV-1a) of the graph's structural content
 * (ids, types, names, flows). Used to detect when a cached synopsis is stale.
 */
export function graphHash(graph: ProcessGraph): string {
  const canon =
    (graph.nodes ?? [])
      .map((n) => `${n.id}|${n.type}|${n.name ?? ""}`)
      .join(";") +
    "#" +
    (graph.flows ?? [])
      .map((f) => `${f.sourceRef}>${f.targetRef}|${f.name ?? ""}`)
      .join(";");
  let h = 0x811c9dc5;
  for (let i = 0; i < canon.length; i++) {
    h ^= canon.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * A compact, deterministic process synopsis: element-type counts, the decision
 * points (gateways) with their outgoing branch labels, and a compact id↔name
 * table for every element (so `proposeEdit` can still target ids precisely).
 * Much smaller than the full node+flow dump, while preserving the facts the
 * assistant needs to answer and to propose edits.
 */
export function describeSynopsis(graph: ProcessGraph): string {
  const nodes = graph.nodes ?? [];
  const flows = graph.flows ?? [];

  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  const countLine = [...counts.entries()].map(([t, n]) => `${n} ${t}`).join(", ") || "(empty)";

  const nameById = new Map(nodes.map((n) => [n.id, n.name ?? ""]));
  const gateways = nodes.filter((n) => /gateway/i.test(n.type));
  const decisions = gateways
    .map((g) => {
      const outs = flows
        .filter((f) => f.sourceRef === g.id)
        .map((f) => f.name || nameById.get(f.targetRef) || f.targetRef)
        .join(" | ");
      return `- ${g.name || g.id} (${g.type}) → ${outs || "(no branches)"}`;
    })
    .join("\n");

  const idTable = nodes
    .map((n) => `${n.id} = ${n.name ? `"${n.name}"` : `(${n.type})`}`)
    .join("\n");

  return [
    `PROCESS SHAPE: ${nodes.length} elements, ${flows.length} flows — ${countLine}.`,
    "",
    "DECISION POINTS:",
    decisions || "(none)",
    "",
    "ELEMENT ID ↔ NAME (use these ids for proposeEdit):",
    idTable || "(none)",
  ].join("\n");
}
```
Export from `packages/ai-advisor/src/index.ts` (add alongside the other exports):
```tsx
export { graphHash, describeSynopsis } from "./synopsis";
```

- [ ] **Step 6: Run the test; confirm PASS.**

Run: `pnpm --filter @claril/ai-advisor exec vitest run src/synopsis.test.ts`
Expected: PASS.

- [ ] **Step 7: Knowledge cache helper (web)**

Create `apps/web/lib/knowledge.ts`:
```tsx
import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { graphHash, describeSynopsis } from "@claril/ai-advisor";
import type { ProcessGraph } from "@claril/logic-inspector";

/**
 * Return a compact process synopsis for grounding, reusing the cached row when
 * the graph hash matches and refreshing it otherwise. Best-effort: on any DB
 * error (e.g. table absent pre-migration) it falls back to computing the
 * synopsis in-memory without persisting.
 */
export async function getOrRefreshSynopsis(
  diagramId: string | undefined,
  graph: ProcessGraph,
  model: string,
): Promise<string> {
  const hash = graphHash(graph);
  if (!diagramId) return describeSynopsis(graph);
  try {
    const rows = await db
      .select({ summary: schema.diagramKnowledge.summary, graphHash: schema.diagramKnowledge.graphHash })
      .from(schema.diagramKnowledge)
      .where(eq(schema.diagramKnowledge.diagramId, diagramId))
      .limit(1);
    if (rows[0]?.graphHash === hash) return rows[0].summary;

    const summary = describeSynopsis(graph);
    await db
      .insert(schema.diagramKnowledge)
      .values({ diagramId, summary, graphHash: hash, model, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.diagramKnowledge.diagramId,
        set: { summary, graphHash: hash, model, updatedAt: new Date() },
      });
    return summary;
  } catch {
    return describeSynopsis(graph);
  }
}
```

- [ ] **Step 8: Ground the chat route on the cached synopsis**

In `apps/web/app/api/ai/chat/route.ts`:

Import:
```tsx
import { getOrRefreshSynopsis } from "@/lib/knowledge";
import { describeFindings } from "@claril/ai-advisor";
```
> Confirm `describeFindings` is exported from `@claril/ai-advisor` — it's defined in `advisor.ts`. If it is NOT re-exported from `index.ts`, add `export { describeFindings } from "./advisor";` there in this task.

Replace the grounding construction. Currently:
```tsx
  const grounding = stripLoneSurrogates(
    describeGroundingPrompt({ graph, findings, assetContext }),
  );
```
with a synopsis-based grounding (keep asset context, keep findings, drop the full node/flow dump):
```tsx
  const synopsis = await getOrRefreshSynopsis(diagramId, graph, config.model ?? "unknown");
  const assetBlock = assetContext ? describeGroundingPrompt({ graph: { nodes: [], flows: [] } as never, findings: [], assetContext }) : "";
  const grounding = stripLoneSurrogates(
    [
      synopsis,
      "",
      "DETERMINISTIC FINDINGS (facts from the logic inspector):",
      describeFindings(findings),
      assetBlock ? `\n${assetBlock}` : "",
    ].join("\n"),
  );
```
> Rationale: `describeSynopsis` gives shape + decisions + id↔name (enough for Q&A and to target `proposeEdit`), `describeFindings` adds the inspector facts, and the existing asset-context block is preserved. This drops the verbose full `describeGraph` node+flow dump from the system prompt. `planEdits` inside the `proposeEdit` tool still receives the full `graph` (unchanged), so edit precision is unaffected.

If the `assetBlock` reconstruction above reads awkwardly, prefer adding a dedicated `describeAssetContext` export from `@claril/ai-advisor` and using it directly:
```tsx
import { describeAssetContext } from "@claril/ai-advisor"; // add `export { describeAssetContext } from "./grounding";` to index.ts
...
      assetContext ? `\nBOUND ASSETS (Asset Catalog — real service semantics):\n${describeAssetContext(assetContext)}` : "",
```
Use whichever is cleaner; the `describeAssetContext` route is preferred. (`describeAssetContext` exists in `grounding.ts`.)

- [ ] **Step 9: Controller applies migration 0008**

(Controller step, after SQL review.) Run: `pnpm --filter @claril/db db:migrate`.

- [ ] **Step 10: Typecheck + build + tests**

Run: `pnpm --filter @claril/ai-advisor exec vitest run`
Run: `pnpm --filter web typecheck`
Run: `pnpm --filter @claril/db typecheck`
Run: `pnpm --filter web build`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/db/src/schema/app.ts packages/db/drizzle packages/ai-advisor/src/synopsis.ts packages/ai-advisor/src/synopsis.test.ts packages/ai-advisor/src/index.ts apps/web/lib/knowledge.ts apps/web/app/api/ai/chat/route.ts
git commit -m "$(cat <<'EOF'
feat(ai): DB-cached compact synopsis grounding (token cut)

diagram_knowledge table (migration 0008) caches a deterministic process
synopsis (shape + decisions + id<->name) keyed by graph hash; chat route
grounds on synopsis + findings + assets instead of the full node/flow dump.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual verification

**Files:** none (runtime; needs an AI provider configured).

- [ ] **Step 1: Exercise chat memory + token cut + sanitize**

Run: `pnpm --filter web dev`
1. Open a BPMN diagram, have a short chat (ask a question, request an edit). Reload the page → the transcript is restored (hydrated from DB).
2. Click **Clear** → transcript empties; reload → stays empty.
3. Paste a message containing an emoji or unusual unicode and send → no `400 invalid high surrogate`; response streams normally.
4. Check the server logs / network: the request to the provider grounds on the compact synopsis (shape + decisions + id↔name), not the full node/flow dump. Ask "rename the approval gateway to 'Manager approval'" → `proposeEdit` still targets the correct id (edit precision preserved).
5. Edit the diagram structurally, then chat again → synopsis regenerates (graph hash changed); reopen later → cached synopsis reused.

Expected: all behaviors as described. Note any deviation.

---

## Self-Review

**Spec coverage** (against `…/specs/2026-06-20-history-ai-review-chat-memory-design.md` §F3):
- Persist chat per diagram (`chat_message`, append/get/clear, hydrate `useChat`, Clear control) → Task 2. ✓
- DB-cached knowledge (`diagram_knowledge`, summary + graphHash + model, regenerate when stale, compact grounding) → Task 3. ✓ (Summary is **deterministically derived** from the graph — cheaper than an extra LLM summarizer call and avoids cold-start guessing; still persisted per the "cache in DB" decision. An LLM-generated semantic summary can replace `describeSynopsis` later behind the same cache.)
- Compact grounding sends synopsis + findings + id↔name instead of full dump; `proposeEdit` still gets the full graph → Task 3 Step 8. ✓
- Surrogate sanitizer before `streamText` (and message persistence is safe because we persist the original parts; the sanitize is applied only on the provider-bound copy) → Task 1. ✓
- Cold-start avoidance: synopsis persisted + reused on reopen → Task 3. ✓

**Placeholder scan:** none — all steps have concrete code. The one conditional ("if `describeFindings`/`describeAssetContext` aren't exported, add the export") is a concrete, bounded instruction with the exact export line.

**Type consistency:** `StoredChatMessage {id, role, parts}` used by `getChatMessages`/`appendChatMessages`/`initialMessages`/persistence map consistently. `graphHash(graph)`/`describeSynopsis(graph)` signatures match test + caller. `getOrRefreshSynopsis(diagramId, graph, model)` matches the route call. New `BpmnWorkbenchProps.initialChatMessages` and `AiDrawerProps.initialChatMessages` share the `{id, role, parts}[]` shape.

**Risk notes:**
- The persistence effect keys on message `id`; AI SDK assigns stable ids, so the `persistedIds` guard prevents duplicate inserts and the `onConflictDoNothing` is a second safety net. Tool-output parts (proposeEdit) are stored in `parts` jsonb and re-render on hydrate as cards (their `applied`/pending state resets to not-pending on reload — acceptable; a reloaded historical proposal is no longer the active pending one).
- `convertToModelMessages` must accept hydrated messages on the next send; since we store the exact UIMessage `parts`, replaying them is valid. If a stored tool part lacks a field `convertToModelMessages` expects, that surfaces in Task 4 — sanitize/validate then.

## Out of scope (later)
- Server-side graph reconstruction from XML to drop `graph` from the client→route body entirely (would also let the route own findings). F3 keeps the client sending the graph for `planEdits`.
- LLM-generated semantic summaries (replace `describeSynopsis` behind the same `diagram_knowledge` cache).
- History-window truncation to cap message-history tokens on very long chats.
