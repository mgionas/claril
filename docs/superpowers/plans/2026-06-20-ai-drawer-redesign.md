# AI Drawer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the right-hand AI drawer as a design-system-native tabbed surface (Chat + Problems) with hybrid-streamed conversation, sent/received bubbles, specialized edit-proposal cards, problems-as-a-tab with per-problem "Ask AI", a markdown documentation viewer with on-demand Regenerate + DB persistence, and AI token-usage accounting (detailed per project/model in Settings, ongoing in chat).

**Architecture:** Chat moves to a streaming route handler (`/api/ai/chat`) using AI SDK v6 `streamText` + a server-side `proposeEdit` tool (backed by the existing `planEdits`). The client uses `@ai-sdk/react` `useChat`. Prose streams token-by-token via `streamdown`; editing turns surface a phase pill then a `proposal-card`. The deterministic findings become a `problems-tab`. Generated docs persist in a new `diagram_doc` table; every AI call records token usage to a new `ai_usage` table.

**Tech Stack:** Next.js 16 (App Router, route handlers), React 19, AI SDK v6 (`ai`, `@ai-sdk/react`), `streamdown`, Tailwind v4 + shadcn/ui, Drizzle + Postgres, bpmn-js (existing `CanvasApi`).

**Spec:** `docs/superpowers/specs/2026-06-20-ai-drawer-redesign-design.md`

---

## File Structure

**Create:**
- `apps/web/app/api/ai/chat/route.ts` — streaming chat route with `proposeEdit` tool + usage capture.
- `apps/web/components/ai-drawer.tsx` — tabbed drawer shell; gates by `aiConnected`; shrinks canvas.
- `apps/web/components/chat-tab.tsx` — `useChat` transcript + composer + phase pills + session usage footer.
- `apps/web/components/chat-bubble.tsx` — sent/received bubble (received uses `streamdown`).
- `apps/web/components/proposal-card.tsx` — specialized edit-plan card (replaces `change-plan-card.tsx`).
- `apps/web/components/problems-tab.tsx` — findings list + Fix + Ask AI.
- `apps/web/components/ui/tabs.tsx`, `scroll-area.tsx`, `tooltip.tsx` — shadcn primitives.
- `apps/web/lib/ai-usage.ts` — `recordAiUsage`, `getUsageSummary` (server-only).
- `apps/web/components/ai/usage-summary.tsx` — Settings usage table (per project/model).

**Modify:**
- `packages/db/src/schema/app.ts` — add `diagram_doc` + `ai_usage` tables (+ generated migration).
- `apps/web/lib/actions.ts` — docs persistence, usage recording in AI actions, remove `runAdvisorQuestion`.
- `apps/web/components/bpmn-workbench.tsx` — render `ai-drawer`; drop Q&A/`aiMessage`; wire chat↔canvas; pass `initialDoc`.
- `apps/web/components/doc-panel.tsx` — `streamdown` viewer + Regenerate + persisted load.
- `apps/web/components/command-bar.tsx` — remove the Q&A button (folded into chat).
- `apps/web/app/d/[diagramId]/page.tsx` — load + pass `initialDoc`.
- `apps/web/app/settings/ai/page.tsx` + `apps/web/components/ai/ai-settings-form.tsx` — render usage summary.
- `apps/web/package.json` — add `streamdown`, `@ai-sdk/react`.

**Delete (only after behavior ported — Task 13):**
- `apps/web/components/change-plan-card.tsx`, `assistant-panel.tsx`, `inspector-panel.tsx`.

---

## Task 1: Dependencies + shadcn primitives

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/components/ui/tabs.tsx`, `apps/web/components/ui/scroll-area.tsx`, `apps/web/components/ui/tooltip.tsx`

- [ ] **Step 1: Add runtime deps (pin to latest stable)**

Run from repo root:
```bash
npm view streamdown version && npm view @ai-sdk/react version
```
Add to `apps/web/package.json` `dependencies` (use the exact latest from the commands above; at authoring time `streamdown@^2.5.0`, `@ai-sdk/react@^3.0.210`):
```jsonc
"@ai-sdk/react": "^3.0.210",
"streamdown": "^2.5.0",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, no peer-dep errors (React 19 + `ai@^6` already present).

- [ ] **Step 3: Add shadcn primitives**

Run: `pnpm --filter web dlx shadcn@latest add tabs scroll-area tooltip`
If the CLI is non-interactive-unfriendly, instead create the three files manually using the project's existing `components/ui/*` style (radix-ui re-exports + `cn`). They must export: `Tabs, TabsList, TabsTrigger, TabsContent`; `ScrollArea, ScrollBar`; `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter web typecheck`
Expected: PASS (new files compile; no usages yet).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/components/ui
git commit -m "chore(web): add streamdown + @ai-sdk/react + tabs/scroll-area/tooltip"
```

---

## Task 2: Database — `diagram_doc` + `ai_usage` tables

**Files:**
- Modify: `packages/db/src/schema/app.ts`
- Generate: `packages/db/drizzle/0004_*.sql`

- [ ] **Step 1: Add tables to schema**

Append to `packages/db/src/schema/app.ts` (after the `version` table; reuse existing imports — add `integer` to the `drizzle-orm/pg-core` import):

```ts
/**
 * Persisted AI-generated process documentation, one row per diagram. Written by
 * `runDocGen`; read on Docs-panel open so it shows instantly and only
 * regenerates on demand. Markdown is the raw model output (rendered downstream).
 */
export const diagramDoc = pgTable("diagram_doc", {
  diagramId: text("diagram_id")
    .primaryKey()
    .references(() => diagram.id, { onDelete: "cascade" }),
  markdown: text("markdown").notNull(),
  model: text("model"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

/**
 * Per-call AI token-usage ledger. One row per model invocation (chat turn,
 * advisor, doc-gen, edit plan, diagram generation). Best-effort: a failed insert
 * never blocks the AI response. Aggregated for the Settings usage view
 * (by project + by model) and summed client-side for the in-chat session meter.
 */
export const aiUsageKind = pgEnum("ai_usage_kind", [
  "chat",
  "advisor",
  "docgen",
  "plan",
  "generate",
]);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Nullable: diagram-independent calls (e.g. generate-from-prompt before save).
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    diagramId: text("diagram_id").references(() => diagram.id, { onDelete: "set null" }),
    kind: aiUsageKind("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_org_idx").on(t.organizationId),
    index("ai_usage_project_idx").on(t.projectId),
  ],
);

export type DiagramDoc = typeof diagramDoc.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
```

- [ ] **Step 2: Generate the migration (do NOT apply)**

Run: `pnpm --filter @claril/db db:generate`
Expected: a new `packages/db/drizzle/0004_*.sql` creating `diagram_doc`, `ai_usage`, and the `ai_usage_kind` enum. **Do not run `db:migrate`** — applying to Neon requires explicit user authorization (call it out at merge time).

- [ ] **Step 3: Verify**

Run: `pnpm --filter @claril/db typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/app.ts packages/db/drizzle
git commit -m "feat(db): diagram_doc + ai_usage tables (generate-only migration)"
```

---

## Task 3: Server — docs persistence + usage recording

**Files:**
- Create: `apps/web/lib/ai-usage.ts`
- Modify: `apps/web/lib/actions.ts`

- [ ] **Step 1: Usage helper**

Create `apps/web/lib/ai-usage.ts`:

```ts
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@claril/db";
import type { LanguageModelUsage } from "ai";

type UsageKind = "chat" | "advisor" | "docgen" | "plan" | "generate";

interface RecordArgs {
  organizationId: string;
  projectId?: string | null;
  diagramId?: string | null;
  kind: UsageKind;
  provider: string;
  model: string;
  usage?: LanguageModelUsage;
}

/** Best-effort: log a single AI call's token usage. Never throws. */
export async function recordAiUsage(args: RecordArgs): Promise<void> {
  try {
    await db.insert(schema.aiUsage).values({
      id: crypto.randomUUID(),
      organizationId: args.organizationId,
      projectId: args.projectId ?? null,
      diagramId: args.diagramId ?? null,
      kind: args.kind,
      provider: args.provider,
      model: args.model,
      inputTokens: args.usage?.inputTokens ?? 0,
      outputTokens: args.usage?.outputTokens ?? 0,
      totalTokens: args.usage?.totalTokens ?? 0,
    });
  } catch {
    // Usage accounting is non-critical; swallow so it never breaks an AI call.
  }
}

export interface UsageRow {
  label: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
}

export interface UsageSummary {
  totalTokens: number;
  byProject: UsageRow[];
  byModel: UsageRow[];
}

/** Aggregate an org's usage, grouped by project name and by model. */
export async function getUsageSummary(organizationId: string): Promise<UsageSummary> {
  const byModelRows = await db
    .select({
      label: schema.aiUsage.model,
      inputTokens: sql<number>`coalesce(sum(${schema.aiUsage.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}),0)::int`,
      totalTokens: sql<number>`coalesce(sum(${schema.aiUsage.totalTokens}),0)::int`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.organizationId, organizationId))
    .groupBy(schema.aiUsage.model)
    .orderBy(desc(sql`sum(${schema.aiUsage.totalTokens})`));

  const byProjectRows = await db
    .select({
      label: sql<string>`coalesce(${schema.project.name}, 'Unattributed')`,
      inputTokens: sql<number>`coalesce(sum(${schema.aiUsage.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}),0)::int`,
      totalTokens: sql<number>`coalesce(sum(${schema.aiUsage.totalTokens}),0)::int`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.aiUsage)
    .leftJoin(schema.project, eq(schema.aiUsage.projectId, schema.project.id))
    .where(eq(schema.aiUsage.organizationId, organizationId))
    .groupBy(schema.project.name)
    .orderBy(desc(sql`sum(${schema.aiUsage.totalTokens})`));

  const totalTokens = byModelRows.reduce((n, r) => n + r.totalTokens, 0);
  return { totalTokens, byProject: byProjectRows, byModel: byModelRows };
}

/** Resolve a diagram's owning project (for usage attribution). */
export async function projectIdForDiagram(diagramId: string): Promise<string | null> {
  const rows = await db
    .select({ projectId: schema.diagram.projectId })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  return rows[0]?.projectId ?? null;
}
```

- [ ] **Step 2: Make `resolveAiContext` return org + project for attribution**

In `apps/web/lib/actions.ts`, change `resolveAiContext` to also surface `orgId` and (when a diagram is given) its project id:

```ts
async function resolveAiContext(diagramId?: string) {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  const config = orgId ? await getOrgAiConfig(orgId) : null;
  if (!config || !orgId) throw new Error("No AI provider configured.");
  const assetContext = diagramId
    ? await buildDiagramAssetContext(orgId, diagramId)
    : undefined;
  const projectId = diagramId ? await projectIdForDiagram(diagramId) : null;
  return { config, assetContext, orgId, projectId };
}
```
Add the import: `import { recordAiUsage, projectIdForDiagram } from "@/lib/ai-usage";`.

The AI SDK calls inside `advise` / `generateProcessDoc` / `planEdits` / `generateBpmnXml` already return usage, but those helpers currently return only their payloads. **Do not change package signatures.** Instead, record usage at the action boundary by having each ai-advisor function also return usage. Implement the smallest change: add usage passthrough (Step 3).

- [ ] **Step 3: Surface usage from ai-advisor helpers**

In each of `packages/ai-advisor/src/{advisor,docgen,qa,planner,generate-bpmn}.ts`, the `generateText`/`generateObject` result already exposes `.usage`. Add a sibling export that returns `{ value, usage }` without breaking existing callers. Example for `planner.ts`:

```ts
import type { LanguageModelUsage } from "ai";

export async function planEditsWithUsage(
  input: PlanEditsInput,
  config: LLMProviderConfig,
): Promise<{ plan: EditPlan; usage: LanguageModelUsage }> {
  const { object, usage } = await generateObject({
    model: createModel(config),
    schema: EditPlanSchema,
    system: PLANNER_SYSTEM_PROMPT,
    prompt: buildPlannerPrompt(input),
  });
  return { plan: object, usage };
}
```
Keep the existing `planEdits` delegating to it: `export async function planEdits(...) { return (await planEditsWithUsage(...)).plan; }`. Do the same shape for `adviseWithUsage`, `generateProcessDocWithUsage`, `generateBpmnXmlWithUsage` (and `answerQuestion` can be left — it is being removed). Export the new functions from `packages/ai-advisor/src/index.ts`.

- [ ] **Step 4: Persist docs + record usage in `runDocGen`**

Replace `runDocGen` in `apps/web/lib/actions.ts`:

```ts
export async function runDocGen(
  graph: ProcessGraph,
  findings: Finding[],
  diagramId?: string,
): Promise<string> {
  const { config, assetContext, orgId, projectId } = await resolveAiContext(diagramId);
  const { value, usage } = await generateProcessDocWithUsage(
    { graph, findings, assetContext },
    config,
  );
  await recordAiUsage({
    organizationId: orgId,
    projectId,
    diagramId,
    kind: "docgen",
    provider: config.provider,
    model: config.model ?? "unknown",
    usage,
  });
  if (diagramId) await upsertDiagramDoc(diagramId, value, config.model ?? null);
  return value;
}

export async function getDiagramDoc(diagramId: string): Promise<string | null> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  const rows = await db
    .select({ markdown: schema.diagramDoc.markdown })
    .from(schema.diagramDoc)
    .where(eq(schema.diagramDoc.diagramId, diagramId))
    .limit(1);
  return rows[0]?.markdown ?? null;
}

async function upsertDiagramDoc(
  diagramId: string,
  markdown: string,
  model: string | null,
): Promise<void> {
  await db
    .insert(schema.diagramDoc)
    .values({ diagramId, markdown, model, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.diagramDoc.diagramId,
      set: { markdown, model, generatedAt: new Date() },
    });
}
```
Apply the same `recordAiUsage` pattern to `runAdvisor` (kind `"advisor"`, using `adviseWithUsage`), `runDiagramEdit` (kind `"plan"`, `planEditsWithUsage`), and `generateDiagramFromPrompt` (kind `"generate"`, `generateBpmnXmlWithUsage`; `projectId`/`diagramId` are null there). Update imports accordingly.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @claril/ai-advisor typecheck && pnpm --filter @claril/ai-advisor test && pnpm --filter web typecheck`
Expected: PASS (existing planner test still green; new with-usage exports compile).

- [ ] **Step 6: Commit**

```bash
git add packages/ai-advisor/src apps/web/lib/actions.ts apps/web/lib/ai-usage.ts
git commit -m "feat(ai): persist generated docs + record token usage per call"
```

---

## Task 4: Streaming chat route

**Files:**
- Create: `apps/web/app/api/ai/chat/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { headers } from "next/headers";
import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getOrgAiConfig, getUserOrgId } from "@/lib/ai";
import { createModel, planEdits, describeGroundingPrompt } from "@claril/ai-advisor";
import { buildDiagramAssetContext } from "@/lib/catalog-grounding";
import { recordAiUsage, projectIdForDiagram } from "@/lib/ai-usage";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";

export const maxDuration = 60;

const BodySchema = z.object({
  messages: z.array(z.any()),
  graph: z.any(),
  findings: z.array(z.any()).default([]),
  diagramId: z.string().optional(),
});

const CHAT_SYSTEM = `You are Claril's AI assistant working inside a BPMN process editor.
You are given the exact process graph and the deterministic inspector's findings as FACTS — the only source of truth. Answer questions in concise Markdown, grounding every claim in the provided model; refer to elements by name, not id.
When the user asks you to CHANGE the model (add/remove/connect/rename steps, fix a finding), call the proposeEdit tool with a precise natural-language instruction instead of describing the change in prose. Do not invent steps, systems, or relationships not present.`;

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const orgId = await getUserOrgId(session.user.id);
  const config = orgId ? await getOrgAiConfig(orgId) : null;
  if (!orgId || !config) return new Response("No AI provider configured.", { status: 400 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { messages, graph, findings, diagramId } = parsed.data as {
    messages: UIMessage[];
    graph: ProcessGraph;
    findings: Finding[];
    diagramId?: string;
  };

  const assetContext =
    diagramId && orgId ? await buildDiagramAssetContext(orgId, diagramId) : undefined;
  const projectId = diagramId ? await projectIdForDiagram(diagramId) : null;
  const grounding = describeGroundingPrompt({ graph, findings, assetContext });

  const result = streamText({
    model: createModel(config),
    system: `${CHAT_SYSTEM}\n\nCURRENT MODEL:\n${grounding}`,
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(3),
    tools: {
      proposeEdit: tool({
        description:
          "Propose a structured set of edits to the BPMN model from a natural-language instruction. Returns a validated edit plan the UI renders as a reviewable card.",
        inputSchema: z.object({
          instruction: z
            .string()
            .describe("A precise description of the change the user asked for."),
        }),
        execute: async ({ instruction }) => {
          const plan = await planEdits({ graph, findings, instruction, assetContext }, config);
          return plan; // { summary, ops[] }
        },
      }),
    },
    onError: () => {
      // surfaced to the client via the UI message stream's error part
    },
    onFinish: ({ usage }) => {
      void recordAiUsage({
        organizationId: orgId,
        projectId,
        diagramId,
        kind: "chat",
        provider: config.provider,
        model: config.model ?? "unknown",
        usage,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) =>
      part.type === "finish"
        ? { usage: { input: part.totalUsage.inputTokens, output: part.totalUsage.outputTokens } }
        : undefined,
  });
}
```

- [ ] **Step 2: Export a prompt-only grounding helper**

The route needs the grounding *string* without running a model. `describeGrounding` lives in `advisor.ts` but is not exported. Add to `packages/ai-advisor/src/index.ts`:
```ts
export { describeGrounding as describeGroundingPrompt } from "./advisor";
```
(If `describeGrounding` is not exported from `advisor.ts`, add `export` to its declaration there.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @claril/ai-advisor typecheck && pnpm --filter web typecheck`
Expected: PASS. If `messageMetadata`/`part.totalUsage` shape differs in the installed `ai` version, adjust to the version's finish-part fields (`grep -r "toUIMessageStreamResponse" node_modules/ai/dist/index.d.ts`). The tool-output and prose paths are the contract; usage metadata is best-effort.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/ai/chat/route.ts packages/ai-advisor/src/index.ts packages/ai-advisor/src/advisor.ts
git commit -m "feat(ai): streaming chat route with proposeEdit tool + usage capture"
```

---

## Task 5: Proposal card

**Files:**
- Create: `apps/web/components/proposal-card.tsx`
- Test: `apps/web/components/proposal-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/proposal-card.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { groupOps } from "./proposal-card";

describe("groupOps", () => {
  it("buckets ops by action with labels", () => {
    const groups = groupOps([
      { kind: "addNode", tempId: "t1", type: "task", name: "Review" },
      { kind: "connect", fromRef: "a", toRef: "t1", flow: "sequence" },
      { kind: "updateElement", elementId: "x", name: "Renamed" },
      { kind: "deleteElement", elementId: "y" },
    ] as never);
    expect(groups.added).toHaveLength(1);
    expect(groups.connected).toHaveLength(1);
    expect(groups.updated).toHaveLength(1);
    expect(groups.removed).toHaveLength(1);
    expect(groups.added[0]).toContain("Review");
  });
});
```
> Note: `apps/web` has no test runner yet. If adding vitest to `apps/web` is undesirable, instead place `groupOps` + this test in `packages/ai-advisor/src/edit-plan.ts` (which already has vitest) and import it into the card. Prefer the package location to avoid standing up a web test harness.

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter @claril/ai-advisor test` (if `groupOps` is placed in the package)
Expected: FAIL — `groupOps is not a function`.

- [ ] **Step 3: Implement `groupOps` + the card**

Create `apps/web/components/proposal-card.tsx`:
```tsx
"use client";

import { Plus, ArrowRight, Pencil, Trash2, Check, Undo2 } from "lucide-react";
import type { EditPlan, Op } from "@claril/ai-advisor";

export interface OpGroups {
  added: string[];
  connected: string[];
  updated: string[];
  removed: string[];
}

export function groupOps(ops: Op[]): OpGroups {
  const g: OpGroups = { added: [], connected: [], updated: [], removed: [] };
  for (const op of ops) {
    switch (op.kind) {
      case "addPool": g.added.push(`Pool "${op.name}"`); break;
      case "addLane": g.added.push(`Lane "${op.name}"`); break;
      case "addNode": g.added.push(`${op.type}${op.name ? ` "${op.name}"` : ""}`); break;
      case "connect": g.connected.push(`${op.flow} flow${op.label ? ` "${op.label}"` : ""}`); break;
      case "updateElement": g.updated.push(`${op.elementId}${op.name ? ` → "${op.name}"` : ""}`); break;
      case "deleteElement": g.removed.push(op.elementId); break;
    }
  }
  return g;
}

const SECTIONS = [
  { key: "added", icon: Plus, label: "Add", tone: "text-success" },
  { key: "connected", icon: ArrowRight, label: "Connect", tone: "text-info" },
  { key: "updated", icon: Pencil, label: "Update", tone: "text-warning" },
  { key: "removed", icon: Trash2, label: "Remove", tone: "text-error" },
] as const;

export function ProposalCard({
  plan,
  applied,
  busy,
  onApply,
  onDiscard,
}: {
  plan: EditPlan;
  applied: boolean;
  busy?: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const groups = groupOps(plan.ops);
  const empty = plan.ops.length === 0;

  return (
    <div className="rounded-[10px] border border-hairline bg-elevated/60 p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 font-medium text-accent">✦ {plan.summary}</p>
      {empty ? (
        <p className="text-xs text-fg-subtle">No changes proposed.</p>
      ) : (
        <div className="mb-3 space-y-1.5">
          {SECTIONS.map(({ key, icon: Icon, label, tone }) => {
            const items = groups[key];
            if (items.length === 0) return null;
            return (
              <div key={key} className="flex gap-2">
                <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
                  <ul className="flex flex-wrap gap-1">
                    {items.map((t, i) => (
                      <li key={i} className="rounded-[5px] bg-canvas px-1.5 py-0.5 text-[11px] text-fg-muted">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!empty && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={applied || busy}
            onClick={onApply}
            className="flex items-center gap-1 rounded-[6px] bg-accent px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {applied ? <Check className="size-3.5" /> : null}
            {applied ? "Applied" : "Apply"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="flex items-center gap-1 rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-elevated"
          >
            {applied ? <Undo2 className="size-3.5" /> : null}
            {applied ? "Undo" : "Discard"}
          </button>
        </div>
      )}
    </div>
  );
}
```
If `groupOps` is placed in the package (recommended), import it from `@claril/ai-advisor` instead and delete the local copy + the test note.

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @claril/ai-advisor test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/proposal-card.tsx packages/ai-advisor/src
git commit -m "feat(web): specialized edit-proposal card (grouped ops)"
```

---

## Task 6: Chat bubble

**Files:**
- Create: `apps/web/components/chat-bubble.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

export function ChatBubble({
  role,
  children,
  markdown,
}: {
  role: "user" | "assistant";
  children?: React.ReactNode;
  markdown?: string;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[12px] px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-br-[4px] bg-accent text-white"
            : "rounded-bl-[4px] border border-hairline bg-elevated/60 text-fg",
        )}
      >
        {markdown !== undefined ? (
          <div className="prose-claril">
            <Streamdown>{markdown}</Streamdown>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add a minimal prose style**

In `apps/web/app/globals.css`, add a `.prose-claril` block scoping `streamdown` output (headings/lists/code/links) to the dark tokens (`--color-fg`, `--color-accent`, `--color-elevated`). Keep it small — only the elements docs/answers actually emit.

- [ ] **Step 3: Verify**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/chat-bubble.tsx apps/web/app/globals.css
git commit -m "feat(web): chat bubble with streamdown markdown rendering"
```

---

## Task 7: Chat tab (useChat transcript)

**Files:**
- Create: `apps/web/components/chat-tab.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Wand2, FileText } from "lucide-react";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import type { EditPlan } from "@claril/ai-advisor";
import { ChatBubble } from "@/components/chat-bubble";
import { ProposalCard } from "@/components/proposal-card";

export interface ChatTabHandle {
  /** Inject a message into the transcript (used by "Ask AI" from Problems). */
  ask: (text: string) => void;
}

interface ChatContext {
  graph: ProcessGraph | null;
  findings: Finding[];
  diagramId: string;
}

interface ChatTabProps {
  handleRef: Ref<ChatTabHandle>;
  getContext: () => ChatContext;
  /** Live-apply a proposed plan to the canvas; returns nothing. */
  onProposal: (plan: EditPlan) => void;
  planApplied: boolean;
  onApplyPlan: () => void;
  onDiscardPlan: () => void;
  onGenerateDocs: () => void;
  onReview: () => void;
}

export function ChatTab(props: ChatTabProps) {
  const [input, setInput] = useState("");
  const [sessionTokens, setSessionTokens] = useState(0);
  const seenProposals = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
  });

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const ctx = props.getContext();
    void sendMessage(
      { text: t },
      { body: { graph: ctx.graph, findings: ctx.findings, diagramId: ctx.diagramId } },
    );
  };

  useImperativeHandle(props.handleRef, () => ({ ask: (text) => send(text) }), [props]);

  // Live-apply each new proposeEdit tool output exactly once.
  useEffect(() => {
    for (const m of messages) {
      for (const part of m.parts) {
        if (
          part.type === "tool-proposeEdit" &&
          part.state === "output-available" &&
          !seenProposals.current.has(part.toolCallId)
        ) {
          seenProposals.current.add(part.toolCallId);
          props.onProposal(part.output as EditPlan);
        }
      }
    }
  }, [messages, props]);

  // Accumulate session token usage from finish metadata.
  useEffect(() => {
    let total = 0;
    for (const m of messages) {
      const u = (m.metadata as { usage?: { input: number; output: number } } | undefined)?.usage;
      if (u) total += (u.input ?? 0) + (u.output ?? 0);
    }
    setSessionTokens(total);
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-fg-subtle">
            Ask about this process, or describe a change to apply.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                return m.role === "user" ? (
                  <ChatBubble key={i} role="user">{part.text}</ChatBubble>
                ) : (
                  <ChatBubble key={i} role="assistant" markdown={part.text} />
                );
              }
              if (part.type === "tool-proposeEdit") {
                if (part.state === "output-available") {
                  return (
                    <ProposalCard
                      key={i}
                      plan={part.output as EditPlan}
                      applied={props.planApplied}
                      onApply={props.onApplyPlan}
                      onDiscard={props.onDiscardPlan}
                    />
                  );
                }
                return <PhasePill key={i} label="Drawing changes…" />;
              }
              return null;
            })}
          </div>
        ))}
        {status === "submitted" && <PhasePill label="Analyzing…" />}
        {status === "error" && (
          <p className="px-2 text-xs text-error">The AI request failed. Try again.</p>
        )}
      </div>

      <div className="border-t border-hairline p-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            <Chip icon={Wand2} label="Review" onClick={props.onReview} />
            <Chip icon={FileText} label="Document" onClick={props.onGenerateDocs} />
          </div>
          {sessionTokens > 0 && (
            <span className="text-[10px] text-fg-subtle" title="Tokens used this session">
              {formatTokens(sessionTokens)} tokens
            </span>
          )}
        </div>
        <div className="flex items-end gap-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
                setInput("");
              }
            }}
            rows={2}
            placeholder="Ask a question or describe a change…"
            className="min-h-0 flex-1 resize-none rounded-[6px] border border-hairline bg-canvas px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => { send(input); setInput(""); }}
            disabled={busy}
            className="flex size-8 items-center justify-center rounded-[6px] bg-accent text-white hover:bg-accent/90 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PhasePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-elevated/60 px-2 py-1 text-[11px] text-accent">
      <span className="size-1.5 animate-pulse rounded-full bg-accent" />
      {label}
    </span>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function Chip({
  icon: Icon, label, onClick,
}: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verify part shapes against the installed SDK**

Run: `grep -n "tool-\|output-available\|metadata" node_modules/@ai-sdk/react/dist/index.d.ts | head`
Confirm the tool-part discriminator is `tool-<name>` with `state`/`output`/`toolCallId`. Adjust field names if the installed version differs.

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/chat-tab.tsx
git commit -m "feat(web): chat tab — useChat transcript, phase pills, session token meter"
```

---

## Task 8: Problems tab

**Files:**
- Create: `apps/web/components/problems-tab.tsx`

- [ ] **Step 1: Implement** (port the findings list from `inspector-panel.tsx`, add per-finding "Ask AI")

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import { cn } from "@/lib/utils";

const severityDot: Record<Severity, string> = { error: "bg-error", warning: "bg-warning", info: "bg-info" };

interface ProblemsTabProps {
  findings: Finding[];
  focusedElementId?: string;
  focusNonce?: number;
  aiConnected: boolean;
  aiBusy?: boolean;
  onSelect?: (elementId: string) => void;
  onApplyFix?: (fix: QuickFix) => void;
  /** Send this finding to the AI chat (and switch to the Chat tab). */
  onAskAi?: (finding: Finding) => void;
}

export function ProblemsTab({
  findings, focusedElementId, focusNonce, aiConnected, aiBusy, onSelect, onApplyFix, onAskAi,
}: ProblemsTabProps) {
  const firstFocusedIndex = focusedElementId
    ? findings.findIndex((f) => f.elementId === focusedElementId)
    : -1;
  const focusedRowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (focusedElementId) focusedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedElementId, focusNonce]);

  if (findings.length === 0 && !aiBusy) {
    return <p className="px-2 py-6 text-center text-sm text-fg-subtle">No issues found ✓</p>;
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {findings.map((finding, index) => {
        const clickable = Boolean(finding.elementId && onSelect);
        const isAdvice = finding.source === "advisor";
        const focused = Boolean(finding.elementId && finding.elementId === focusedElementId);
        return (
          <li
            key={`${finding.ruleId}-${finding.elementId ?? index}-${index}`}
            ref={index === firstFocusedIndex ? focusedRowRef : undefined}
            className={cn(
              "rounded-[6px] transition-colors",
              focused ? "bg-accent/10 ring-1 ring-inset ring-accent/40" : "hover:bg-elevated",
            )}
          >
            <div className="flex items-start gap-1">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => finding.elementId && onSelect?.(finding.elementId)}
                className={cn("flex flex-1 gap-2 px-2 py-2 text-left", clickable ? "cursor-pointer" : "cursor-default")}
              >
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", severityDot[finding.severity])} />
                <div className="min-w-0">
                  <p className="text-sm leading-snug">{finding.message}</p>
                  {finding.quickFix && <p className="mt-0.5 text-xs text-fg-subtle">{finding.quickFix}</p>}
                  <p className={cn("mt-1 font-mono text-[10px]", isAdvice ? "text-accent" : "text-fg-subtle")}>
                    {isAdvice ? "✦ AI advisor" : finding.ruleId}
                  </p>
                </div>
              </button>
            </div>
            <div className="flex gap-1 px-2 pb-2">
              {finding.fix && onApplyFix && (
                <button
                  type="button"
                  onClick={() => onApplyFix(finding.fix as QuickFix)}
                  className="rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/10"
                >
                  Fix
                </button>
              )}
              {aiConnected && onAskAi && (
                <button
                  type="button"
                  onClick={() => onAskAi(finding)}
                  className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
                >
                  <Sparkles className="size-3" /> Ask AI
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/problems-tab.tsx
git commit -m "feat(web): problems tab with per-finding Ask AI"
```

---

## Task 9: AI drawer shell (tabbed, gated)

**Files:**
- Create: `apps/web/components/ai-drawer.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState, type Ref } from "react";
import { Sparkles } from "lucide-react";
import type { Finding, QuickFix } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import type { EditPlan } from "@claril/ai-advisor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProblemsTab } from "@/components/problems-tab";
import { ChatTab, type ChatTabHandle } from "@/components/chat-tab";
import { cn } from "@/lib/utils";

export interface AiDrawerProps {
  open: boolean;
  aiConnected: boolean;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
  focusedElementId?: string;
  focusNonce?: number;
  aiBusy?: boolean;
  // chat wiring
  chatHandleRef: Ref<ChatTabHandle>;
  activeTab: "chat" | "problems";
  onTabChange: (tab: "chat" | "problems") => void;
  getChatContext: () => { graph: ProcessGraph | null; findings: Finding[]; diagramId: string };
  planApplied: boolean;
  onProposal: (plan: EditPlan) => void;
  onApplyPlan: () => void;
  onDiscardPlan: () => void;
  onGenerateDocs: () => void;
  onReview: () => void;
  // problems wiring
  onSelect?: (elementId: string) => void;
  onApplyFix?: (fix: QuickFix) => void;
  onAskAiAboutFinding?: (finding: Finding) => void;
}

export function AiDrawer(props: AiDrawerProps) {
  return (
    <aside
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        props.open ? "w-96" : "w-0",
      )}
    >
      <div className="flex h-full w-96 flex-col border-l border-hairline bg-panel/90 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <Sparkles className="size-4 text-accent" />
          <span className="text-sm font-medium">{props.aiConnected ? "Assistant" : "Inspector"}</span>
        </div>

        {props.aiConnected ? (
          <Tabs
            value={props.activeTab}
            onValueChange={(v) => props.onTabChange(v as "chat" | "problems")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-3 mt-2 grid grid-cols-2">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="problems">
                Problems
                {(props.errorCount > 0 || props.warningCount > 0) && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-fg-muted">
                    {props.errorCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span className="size-1.5 rounded-full bg-error" />{props.errorCount}
                      </span>
                    )}
                    {props.warningCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span className="size-1.5 rounded-full bg-warning" />{props.warningCount}
                      </span>
                    )}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="min-h-0 flex-1">
              <ChatTab
                handleRef={props.chatHandleRef}
                getContext={props.getChatContext}
                planApplied={props.planApplied}
                onProposal={props.onProposal}
                onApplyPlan={props.onApplyPlan}
                onDiscardPlan={props.onDiscardPlan}
                onGenerateDocs={props.onGenerateDocs}
                onReview={props.onReview}
              />
            </TabsContent>
            <TabsContent value="problems" className="min-h-0 flex-1 overflow-y-auto">
              <ProblemsTab
                findings={props.findings}
                focusedElementId={props.focusedElementId}
                focusNonce={props.focusNonce}
                aiConnected
                aiBusy={props.aiBusy}
                onSelect={props.onSelect}
                onApplyFix={props.onApplyFix}
                onAskAi={props.onAskAiAboutFinding}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ProblemsTab
              findings={props.findings}
              focusedElementId={props.focusedElementId}
              focusNonce={props.focusNonce}
              aiConnected={false}
              aiBusy={props.aiBusy}
              onSelect={props.onSelect}
              onApplyFix={props.onApplyFix}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ai-drawer.tsx
git commit -m "feat(web): tabbed AI drawer shell (Chat + Problems, gated by aiConnected)"
```

---

## Task 10: Docs panel upgrade

**Files:**
- Modify: `apps/web/components/doc-panel.tsx`

- [ ] **Step 1: Swap the `<pre>` for `streamdown` + add Regenerate**

Replace the body renderer (lines ~109-113) so markdown renders via `Streamdown` inside `.prose-claril`. Add an `onRegenerate: () => void` prop and a **Regenerate** button in the header actions (uses the existing busy state to disable + show the spinner label). Keep Copy + Download.

```tsx
import { Streamdown } from "streamdown";
import { RefreshCw } from "lucide-react";
// ...add to props: onRegenerate: () => void;
// header actions — before Close:
<button
  type="button"
  onClick={onRegenerate}
  disabled={busy}
  title="Regenerate documentation"
  className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
>
  <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />
  {busy ? "…" : "Regenerate"}
</button>
// body:
{!busy && !error && markdown && (
  <div className="prose-claril"><Streamdown>{markdown}</Streamdown></div>
)}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/doc-panel.tsx
git commit -m "feat(web): docs panel — streamdown viewer + Regenerate"
```

---

## Task 11: Workbench integration

**Files:**
- Modify: `apps/web/components/bpmn-workbench.tsx`
- Modify: `apps/web/components/workbench.tsx`, `apps/web/components/mermaid-workbench.tsx` (prop passthrough)
- Modify: `apps/web/app/d/[diagramId]/page.tsx`
- Modify: `apps/web/components/command-bar.tsx`

- [ ] **Step 1: Load + pass `initialDoc`**

In `apps/web/app/d/[diagramId]/page.tsx`, after fetching the diagram, load the persisted doc and pass it down:
```ts
import { getDiagramDoc } from "@/lib/actions";
// ...
const initialDoc = aiConfig ? await getDiagramDoc(diagram.id) : null;
// pass initialDoc={initialDoc} to <Workbench/>
```
Thread `initialDoc?: string | null` through `Workbench` → `BpmnWorkbench` (Mermaid path may ignore it).

- [ ] **Step 2: Rewire `bpmn-workbench.tsx`**

- Replace the `InspectorPanel`/`AssistantPanel` branch (lines 374-405) with a single `<AiDrawer .../>`.
- Remove Q&A state + handlers: `qaQuestion`, `qaAnswer`, `handleAskQuestion`, `handleClearQa`, and the `runAdvisorQuestion` import. Remove the `aiMessage` state.
- Add `activeTab` state (`"chat" | "problems"`) and a `chatHandleRef = useRef<ChatTabHandle>(null)`.
- Keep `handleApplyPlan` / `handleDiscardPlan` / `preEditXmlRef` as-is.
- Replace `handleInstruct` with `handleProposal(plan)` (live-apply, snapshot, diff) — same body as today's post-`runDiagramEdit` block but taking a `plan` argument:
```tsx
const handleProposal = useCallback((plan: EditPlan) => {
  setPlan(plan);
  setPlanApplied(false);
  if (plan.ops.length > 0) {
    preEditXmlRef.current = currentXmlRef.current;
    const changed = canvasApiRef.current?.applyEditPlan(plan) ?? [];
    canvasApiRef.current?.showDiff({ added: changed, removed: [], changed: [], layout: [] });
  }
}, []);
```
- Add `handleAskAiAboutFinding`:
```tsx
const handleAskAiAboutFinding = useCallback((f: Finding) => {
  setInspectorOpen(true);
  setActiveTab("chat");
  const ref = f.elementId ? ` (element ${f.elementId})` : "";
  chatHandleRef.current?.ask(`Help me resolve: "${f.message}"${ref}. Rule ${f.ruleId}.`);
}, []);
```
- `getChatContext`: `() => ({ graph: graphRef.current, findings: findingsRef.current, diagramId })`.
- `handleGenerateDocs`: seed from `initialDoc` (don't auto-generate); generate only when there's no doc yet or on Regenerate. Add `handleRegenerateDocs` that always calls `runDocGen`. The `Docs` button opens the panel; if `docMarkdown` is null and no `initialDoc`, generate once.
- `onReview` → existing `handleAskAi` (advisor critique). Keep advisor findings merged into `allFindings`.
- Render `<AiDrawer>` with all wiring; pass `errorCount`/`warningCount`.

- [ ] **Step 3: Trim `command-bar.tsx`**

Remove the Q&A button + the `askOpen`/`question` input block and the `onAskQuestion` prop (folded into chat). Keep `Ask AI` (review) and `Docs`. Update the `CommandBar` call site in `bpmn-workbench.tsx` to drop `onAskQuestion`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS. Manually sanity-check: drawer opens, tabs switch, composer sends.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components apps/web/app/d
git commit -m "feat(web): wire tabbed AI drawer into workbench; chat replaces Q&A"
```

---

## Task 12: Settings — token usage view

**Files:**
- Create: `apps/web/components/ai/usage-summary.tsx`
- Modify: `apps/web/app/settings/ai/page.tsx`

- [ ] **Step 1: Server data on the settings page**

In `apps/web/app/settings/ai/page.tsx`, resolve the org and load the summary:
```ts
import { getUserOrgId } from "@/lib/ai";
import { getUsageSummary } from "@/lib/ai-usage";
import { UsageSummary } from "@/components/ai/usage-summary";
// ...
const orgId = await getUserOrgId(session.user.id);
const usage = orgId ? await getUsageSummary(orgId) : null;
// render <UsageSummary data={usage} /> below <AiSettingsForm/>
```

- [ ] **Step 2: Usage table component**

Create `apps/web/components/ai/usage-summary.tsx` — a server component (no `"use client"`). Renders two grouped tables (By project, By model) with columns Input / Output / Total / Calls, a grand-total header, and an empty state ("No AI usage yet."). Use the design tokens + hairline borders; format token counts with the same `k` helper.

```tsx
import type { UsageSummary as Data } from "@/lib/ai-usage";

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function UsageSummary({ data }: { data: Data | null }) {
  if (!data || data.totalTokens === 0) {
    return <p className="mt-8 text-sm text-fg-subtle">No AI usage yet.</p>;
  }
  const table = (title: string, rows: Data["byModel"]) => (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="overflow-hidden rounded-[8px] border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-elevated/40 text-fg-muted">
            <tr>
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-right font-normal">Input</th>
              <th className="px-3 py-2 text-right font-normal">Output</th>
              <th className="px-3 py-2 text-right font-normal">Total</th>
              <th className="px-3 py-2 text-right font-normal">Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-hairline">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right text-fg-muted">{fmt(r.inputTokens)}</td>
                <td className="px-3 py-2 text-right text-fg-muted">{fmt(r.outputTokens)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.totalTokens)}</td>
                <td className="px-3 py-2 text-right text-fg-muted">{r.calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-medium">Token usage</h2>
        <span className="text-sm text-fg-muted">{fmt(data.totalTokens)} tokens total</span>
      </div>
      {table("By project", data.byProject)}
      {table("By model", data.byModel)}
    </section>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ai/usage-summary.tsx apps/web/app/settings/ai/page.tsx
git commit -m "feat(web): token-usage summary on AI settings (by project + model)"
```

---

## Task 13: Cleanup + final verification

**Files:**
- Delete: `apps/web/components/change-plan-card.tsx`, `assistant-panel.tsx`, `inspector-panel.tsx`
- Modify: `apps/web/lib/actions.ts` (remove `runAdvisorQuestion`), `packages/ai-advisor/src/index.ts` + `qa.ts` (remove `answerQuestion` if now unused)

- [ ] **Step 1: Remove superseded files + dead exports**

```bash
git rm apps/web/components/change-plan-card.tsx apps/web/components/assistant-panel.tsx apps/web/components/inspector-panel.tsx
```
Remove `runAdvisorQuestion` from `actions.ts` and its now-unused imports. If nothing imports `answerQuestion`, remove it + its export (and `qa.ts` if empty).

- [ ] **Step 2: Grep for stragglers**

Run: `grep -rn "ChangePlanCard\|AssistantPanel\|InspectorPanel\|runAdvisorQuestion\|onAskQuestion\|qaAnswer" apps/web packages | grep -v "\.test\."`
Expected: no matches (or only in this plan/spec docs).

- [ ] **Step 3: Full verification**

Run: `pnpm typecheck && pnpm --filter @claril/ai-advisor test && pnpm --filter web build`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(web): drop legacy inspector/assistant/Q&A; chat is the AI surface"
```

---

## Final notes for the executor

- **Migration safety:** Task 2 only *generates* `0004_*.sql`. Applying it to Neon (`db:migrate`) requires explicit user authorization — surface this at merge time, do not run it autonomously.
- **AI SDK version drift:** Tasks 4 & 7 encode AI SDK v6 shapes (`tool({inputSchema})`, `convertToModelMessages`, `DefaultChatTransport`, `tool-<name>` parts, finish `messageMetadata`). Verify against `node_modules/ai` + `node_modules/@ai-sdk/react` `.d.ts` before assuming a field name; the prose-stream + tool-output contract is stable, only metadata/usage field names may shift.
- **No live AI in CI:** all gates are typecheck/build/unit. The streamed chat, ask-AI-from-problem, propose→apply→undo, and docs regenerate+persistence paths need a live BYOK key — verify manually (or via Playwright with a key) after merge.
```
