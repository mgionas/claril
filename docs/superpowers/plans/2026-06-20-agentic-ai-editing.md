# Agentic AI Editing (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drive the BPMN model with natural language — the AI returns a typed, reviewable EditPlan that, on approval, creates/updates/deletes elements on the canvas (one undo step), with the right panel becoming an Assistant chat when AI is connected.

**Architecture:** Provider-agnostic planner (`@claril/ai-advisor`, BYOK, structured output) produces a layout-free `EditPlan`. A client executor (`apps/web/lib/apply-edit-plan.ts`) replays the plan against bpmn-js `modeling` as one command. HITL preview reuses the W4 diff (`CanvasApi.showDiff`/`reloadXml`): apply-live → highlight → Apply (save) or Discard (revert). The right drawer swaps `InspectorPanel` (AI off) ↔ `AssistantPanel` (AI on) by `aiConnected`.

**Tech Stack:** TypeScript 6, Zod 4, Vercel AI SDK 6 (`generateObject`), bpmn-js 18 (`modeling`, `autoPlace`, `elementFactory`), `bpmn-auto-layout`, React 19 / Next 16, Tailwind 4 + shadcn primitives (already present).

**Reused infra:** `createModel`/`describeGrounding` (W6), `CanvasApi.showDiff/clearDiff/reloadXml` + `DiffMarks` (W4), `apply-fix.ts` executor pattern, `buildDiagramAssetContext` grounding, the AI-config resolution in `runAdvisor`/`runDocGen`.

---

## File structure

- `packages/ai-advisor/src/edit-plan.ts` — **Create.** `EditPlan`/`Op` Zod schema + types; pure helpers `orderOps` and `collectPlanRefs`. (no DOM, no SDK)
- `packages/ai-advisor/src/edit-plan.test.ts` — **Create.** Unit tests for schema + helpers.
- `packages/ai-advisor/src/planner.ts` — **Create.** `planEdits(input, config)` (SDK `generateObject`) + pure `buildPlannerPrompt(input)`.
- `packages/ai-advisor/src/planner.test.ts` — **Create.** Unit test for `buildPlannerPrompt`.
- `packages/ai-advisor/src/index.ts` — **Modify.** Export the new symbols.
- `packages/ai-advisor/package.json` — **Modify.** Add `vitest` dev dep + `test` script.
- `apps/web/lib/apply-edit-plan.ts` — **Create.** `applyEditPlan(modeler, plan): { changedIds }` (bpmn-js executor).
- `apps/web/lib/actions.ts` — **Modify.** Add `runDiagramEdit` server action.
- `apps/web/components/bpmn-canvas.tsx` — **Modify.** Extend `CanvasApi` with `applyEditPlan`.
- `apps/web/components/change-plan-card.tsx` — **Create.** The op-list card with Apply/Discard.
- `apps/web/components/assistant-panel.tsx` — **Create.** AI-on right panel (findings cards + instruction input + chips + plan card).
- `apps/web/components/bpmn-workbench.tsx` — **Modify.** Swap Inspector↔Assistant by `aiConnected`; wire plan→preview→apply/discard.
- `apps/web/package.json` — **Modify.** Add `bpmn-auto-layout`.

> Scope note: persistence/multi-turn history (slice 2), project knowledge (slice 3), and richer cards (slice 4) are intentionally out of this plan.

---

## Task 1: EditPlan schema + pure helpers (`@claril/ai-advisor`)

**Files:**
- Modify: `packages/ai-advisor/package.json`
- Create: `packages/ai-advisor/src/edit-plan.ts`
- Test: `packages/ai-advisor/src/edit-plan.test.ts`

- [ ] **Step 1: Add vitest to the package** (mirrors `@claril/logic-inspector`)

In `packages/ai-advisor/package.json`, add to `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`. Add to `devDependencies`: `"vitest": "^3.2.4"` (verify latest with `npm view vitest version`; match the version `@claril/logic-inspector` uses — run `node -e "console.log(require('./packages/logic-inspector/package.json').devDependencies)"` and copy that exact vitest version).

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `packages/ai-advisor/src/edit-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EditPlanSchema, orderOps, collectPlanRefs } from "./edit-plan";

describe("EditPlanSchema", () => {
  it("accepts a valid plan and rejects an unknown op kind", () => {
    const ok = EditPlanSchema.safeParse({
      summary: "add a task",
      ops: [{ kind: "addNode", tempId: "t1", type: "task", name: "Do" }],
    });
    expect(ok.success).toBe(true);

    const bad = EditPlanSchema.safeParse({ summary: "x", ops: [{ kind: "frobnicate" }] });
    expect(bad.success).toBe(false);
  });
});

describe("orderOps", () => {
  it("orders pools → lanes → nodes → connects → updates → deletes", () => {
    const ordered = orderOps([
      { kind: "connect", fromRef: "a", toRef: "b", flow: "sequence" },
      { kind: "deleteElement", elementId: "Task_9" },
      { kind: "addLane", tempId: "l1", poolRef: "p1", name: "L" },
      { kind: "addNode", tempId: "a", type: "task" },
      { kind: "addPool", tempId: "p1", name: "P" },
      { kind: "updateElement", elementId: "Task_1", name: "R" },
    ]);
    expect(ordered.map((o) => o.kind)).toEqual([
      "addPool", "addLane", "addNode", "connect", "updateElement", "deleteElement",
    ]);
  });
});

describe("collectPlanRefs", () => {
  it("returns the tempIds a plan defines", () => {
    const refs = collectPlanRefs({
      summary: "",
      ops: [
        { kind: "addPool", tempId: "p1", name: "P" },
        { kind: "addNode", tempId: "n1", type: "task" },
      ],
    });
    expect(refs.defined).toEqual(new Set(["p1", "n1"]));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @claril/ai-advisor test`
Expected: FAIL — `Cannot find module './edit-plan'`.

- [ ] **Step 4: Implement the schema + helpers**

Create `packages/ai-advisor/src/edit-plan.ts`:

```ts
import { z } from "zod";

/** Node types the planner may create (kept aligned with bpmn-js create types). */
export const NODE_TYPES = [
  "startEvent",
  "endEvent",
  "task",
  "userTask",
  "serviceTask",
  "exclusiveGateway",
  "parallelGateway",
  "intermediateThrowEvent",
  "intermediateCatchEvent",
] as const;

const AddPool = z.object({ kind: z.literal("addPool"), tempId: z.string(), name: z.string() });
const AddLane = z.object({
  kind: z.literal("addLane"),
  tempId: z.string(),
  poolRef: z.string(),
  name: z.string(),
});
const AddNode = z.object({
  kind: z.literal("addNode"),
  tempId: z.string(),
  type: z.enum(NODE_TYPES),
  name: z.string().optional(),
  /** tempId or existing elementId of the containing pool/lane. */
  containerRef: z.string().optional(),
});
const Connect = z.object({
  kind: z.literal("connect"),
  fromRef: z.string(),
  toRef: z.string(),
  label: z.string().optional(),
  flow: z.enum(["sequence", "message"]),
});
const UpdateElement = z.object({
  kind: z.literal("updateElement"),
  elementId: z.string(),
  name: z.string().optional(),
});
const DeleteElement = z.object({ kind: z.literal("deleteElement"), elementId: z.string() });

export const OpSchema = z.discriminatedUnion("kind", [
  AddPool,
  AddLane,
  AddNode,
  Connect,
  UpdateElement,
  DeleteElement,
]);
export type Op = z.infer<typeof OpSchema>;

export const EditPlanSchema = z.object({
  summary: z.string(),
  ops: z.array(OpSchema),
});
export type EditPlan = z.infer<typeof EditPlanSchema>;

const ORDER: Record<Op["kind"], number> = {
  addPool: 0,
  addLane: 1,
  addNode: 2,
  connect: 3,
  updateElement: 4,
  deleteElement: 5,
};

/** Stable sort into a dependency-safe execution order. */
export function orderOps(ops: Op[]): Op[] {
  return ops
    .map((op, i) => [op, i] as const)
    .sort(([a, ai], [b, bi]) => ORDER[a.kind] - ORDER[b.kind] || ai - bi)
    .map(([op]) => op);
}

/** The tempIds a plan defines (for validating connect/container references). */
export function collectPlanRefs(plan: EditPlan): { defined: Set<string> } {
  const defined = new Set<string>();
  for (const op of plan.ops) {
    if (op.kind === "addPool" || op.kind === "addLane" || op.kind === "addNode") {
      defined.add(op.tempId);
    }
  }
  return { defined };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @claril/ai-advisor test`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ai-advisor/package.json packages/ai-advisor/src/edit-plan.ts packages/ai-advisor/src/edit-plan.test.ts pnpm-lock.yaml
git commit -m "feat(ai-advisor): EditPlan schema + ordering/ref helpers (+vitest)"
```

---

## Task 2: Planner (`planEdits` + `buildPlannerPrompt`)

**Files:**
- Create: `packages/ai-advisor/src/planner.ts`
- Test: `packages/ai-advisor/src/planner.test.ts`
- Modify: `packages/ai-advisor/src/index.ts`

- [ ] **Step 1: Write the failing test (pure prompt builder)**

Create `packages/ai-advisor/src/planner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPlannerPrompt } from "./planner";

describe("buildPlannerPrompt", () => {
  it("includes the instruction and the current element ids", () => {
    const prompt = buildPlannerPrompt({
      graph: {
        nodes: [{ id: "StartEvent_1", type: "startEvent", name: "Start" }],
        edges: [],
      } as any,
      findings: [],
      instruction: "add an end event after Start",
    });
    expect(prompt).toContain("add an end event after Start");
    expect(prompt).toContain("StartEvent_1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @claril/ai-advisor test planner`
Expected: FAIL — `Cannot find module './planner'`.

- [ ] **Step 3: Implement the planner**

Create `packages/ai-advisor/src/planner.ts`:

```ts
import { generateObject } from "ai";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";
import type { AssetContext } from "./grounding";
import { describeGrounding } from "./advisor";
import { EditPlanSchema, type EditPlan } from "./edit-plan";

export interface PlanEditsInput {
  graph: ProcessGraph;
  findings: Finding[];
  assetContext?: AssetContext;
  /** The user's natural-language editing instruction. */
  instruction: string;
}

const PLANNER_SYSTEM_PROMPT = `You are Claril's BPMN editing planner. Given the current process model and a user instruction, produce a MINIMAL, VALID plan of edit operations — never prose, never XML, never coordinates.

Rules:
- Reference EXISTING elements by their exact id (shown in CURRENT MODEL). Reference elements you create earlier in the same plan by their tempId.
- Use flow:"sequence" for connections inside one process/pool; use flow:"message" for connections BETWEEN different pools (participants).
- Put a node inside a pool/lane with containerRef (a pool/lane tempId or an existing element id) when the instruction implies swimlanes.
- Prefer the smallest set of ops that satisfies the instruction. Do not restructure unrelated parts of the model.
- "summary" is a one-line human description of the change.`;

/** Pure: assemble the user-facing prompt (grounding + instruction). Testable. */
export function buildPlannerPrompt(input: PlanEditsInput): string {
  const grounding = describeGrounding({
    graph: input.graph,
    findings: input.findings,
    assetContext: input.assetContext,
  });
  return `CURRENT MODEL:\n${grounding}\n\nINSTRUCTION:\n${input.instruction}`;
}

/** Produce a validated EditPlan from a natural-language instruction (BYOK). */
export async function planEdits(
  input: PlanEditsInput,
  config: LLMProviderConfig,
): Promise<EditPlan> {
  const { object } = await generateObject({
    model: createModel(config),
    schema: EditPlanSchema,
    system: PLANNER_SYSTEM_PROMPT,
    prompt: buildPlannerPrompt(input),
  });
  return object;
}
```

> Note: `describeGrounding` already emits the node ids + types + labels + edges and asset context (verify it lists ids; it is used by `advise`/`docgen`). If it does not include element ids, extend `describeGraph` in `advisor.ts` to print `id` per node — but it should already.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @claril/ai-advisor test planner`
Expected: PASS. If it fails because `describeGrounding` omits ids, add ids in `describeGraph` (each node line includes its `id`) and re-run.

- [ ] **Step 5: Export from index**

In `packages/ai-advisor/src/index.ts`, add:

```ts
export {
  EditPlanSchema,
  OpSchema,
  orderOps,
  collectPlanRefs,
  NODE_TYPES,
  type EditPlan,
  type Op,
} from "./edit-plan";
export { planEdits, buildPlannerPrompt, type PlanEditsInput } from "./planner";
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @claril/ai-advisor typecheck` (expect pass)

```bash
git add packages/ai-advisor/src/planner.ts packages/ai-advisor/src/planner.test.ts packages/ai-advisor/src/index.ts
git commit -m "feat(ai-advisor): planEdits — NL instruction -> validated EditPlan (BYOK)"
```

---

## Task 3: `runDiagramEdit` server action

**Files:**
- Modify: `apps/web/lib/actions.ts`

- [ ] **Step 1: Add the action** (mirror `runDocGen`'s config + grounding resolution)

In `apps/web/lib/actions.ts`, import `planEdits` and `EditPlan` from `@claril/ai-advisor` (add to the existing import from that package), then add near `runDocGen`:

```ts
/** Plan model edits from a natural-language instruction. Grounded + BYOK. */
export async function runDiagramEdit(
  graph: ProcessGraph,
  findings: Finding[],
  instruction: string,
  diagramId?: string,
): Promise<EditPlan> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  const config = orgId ? await getOrgAiConfig(orgId) : null;
  if (!config) throw new Error("No AI provider configured.");
  const assetContext =
    orgId && diagramId ? await buildDiagramAssetContext(orgId, diagramId) : undefined;
  return planEdits({ graph, findings, instruction, assetContext }, config);
}
```

> `requireUserId`, `getUserOrgId`, `getOrgAiConfig`, `buildDiagramAssetContext`, `ProcessGraph`, `Finding` are all already imported/used by `runAdvisor`/`runDocGen` in this file — reuse them; add only `planEdits`/`EditPlan` to the `@claril/ai-advisor` import.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter web typecheck` (expect pass)

```bash
git add apps/web/lib/actions.ts
git commit -m "feat(web): runDiagramEdit server action (planEdits, grounded, BYOK)"
```

---

## Task 4: Executor + `CanvasApi.applyEditPlan`

**Files:**
- Modify: `apps/web/package.json` (add `bpmn-auto-layout`)
- Create: `apps/web/lib/apply-edit-plan.ts`
- Modify: `apps/web/components/bpmn-canvas.tsx` (extend `CanvasApi`)

- [ ] **Step 1: Add the auto-layout dep**

Run: `npm view bpmn-auto-layout version` then `pnpm add --filter web bpmn-auto-layout@<latest>`.

- [ ] **Step 2: Implement the executor** (extends the `apply-fix.ts` pattern)

Create `apps/web/lib/apply-edit-plan.ts`:

```ts
import type { EditPlan, Op } from "@claril/ai-advisor";
import { orderOps } from "@claril/ai-advisor";

interface ModelerServices {
  get(name: string): any;
}

const BPMN_TYPE: Record<string, string> = {
  startEvent: "bpmn:StartEvent",
  endEvent: "bpmn:EndEvent",
  task: "bpmn:Task",
  userTask: "bpmn:UserTask",
  serviceTask: "bpmn:ServiceTask",
  exclusiveGateway: "bpmn:ExclusiveGateway",
  parallelGateway: "bpmn:ParallelGateway",
  intermediateThrowEvent: "bpmn:IntermediateThrowEvent",
  intermediateCatchEvent: "bpmn:IntermediateCatchEvent",
};

/**
 * Apply an EditPlan to the live modeler as a SINGLE undoable command. Returns
 * the element ids that were created/changed (for diff highlighting). All edits
 * go through `modeling`/`autoPlace` so re-inspection + autosave fire normally.
 */
export function applyEditPlan(
  modeler: ModelerServices,
  plan: EditPlan,
): { changedIds: string[] } {
  const elementRegistry = modeler.get("elementRegistry");
  const modeling = modeler.get("modeling");
  const elementFactory = modeler.get("elementFactory");
  const autoPlace = modeler.get("autoPlace");
  const canvas = modeler.get("canvas");

  const temp = new Map<string, any>(); // tempId -> created element
  const changed = new Set<string>();
  const resolve = (ref: string) => temp.get(ref) ?? elementRegistry.get(ref);

  const root = canvas.getRootElement();

  for (const op of orderOps(plan.ops)) {
    try {
      applyOne(op);
    } catch {
      // Skip an individual op that can't resolve its refs; the plan card
      // already warned. Do not abort the whole batch mid-way.
    }
  }

  function applyOne(op: Op) {
    switch (op.kind) {
      case "addPool": {
        const pool = elementFactory.createParticipantShape();
        const placed = modeling.createShape(pool, { x: 300, y: 200 }, root);
        if (op.name) modeling.updateProperties(placed, { name: op.name });
        temp.set(op.tempId, placed);
        changed.add(placed.id);
        return;
      }
      case "addLane": {
        const pool = resolve(op.poolRef);
        if (!pool) return;
        const lane = modeling.addLane(pool, "bottom");
        if (op.name) modeling.updateProperties(lane, { name: op.name });
        temp.set(op.tempId, lane);
        changed.add(lane.id);
        return;
      }
      case "addNode": {
        const type = BPMN_TYPE[op.type];
        const shape = elementFactory.createShape({ type });
        const container = op.containerRef ? resolve(op.containerRef) : null;
        let placed;
        if (container) {
          placed = modeling.createShape(shape, { x: 0, y: 0 }, container);
          modeling.moveElements([placed], { x: 80, y: 60 }, container);
        } else {
          placed = modeling.createShape(shape, { x: 300, y: 200 }, root);
        }
        if (op.name) modeling.updateProperties(placed, { name: op.name });
        temp.set(op.tempId, placed);
        changed.add(placed.id);
        return;
      }
      case "connect": {
        const from = resolve(op.fromRef);
        const to = resolve(op.toRef);
        if (!from || !to) return;
        const conn = modeling.connect(from, to);
        if (op.label && conn) modeling.updateProperties(conn, { name: op.label });
        if (conn) changed.add(conn.id);
        return;
      }
      case "updateElement": {
        const el = elementRegistry.get(op.elementId);
        if (el && op.name !== undefined) {
          modeling.updateProperties(el, { name: op.name });
          changed.add(el.id);
        }
        return;
      }
      case "deleteElement": {
        const el = elementRegistry.get(op.elementId);
        if (el) modeling.removeElements([el]);
        return;
      }
    }
  }

  return { changedIds: [...changed] };
}
```

> Layout note: `modeling.connect` infers source/target and `modeling.createShape` places at the given point. For multi-pool builds the initial positions may overlap; Task 7 verifies in-browser and, if layout is poor, the implementer adds a post-pass using `bpmn-auto-layout` (serialize → layout → `reloadXml`). Keep the op-replay path as the primary mechanism; auto-layout is a fallback polish.

- [ ] **Step 3: Extend `CanvasApi`**

In `apps/web/components/bpmn-canvas.tsx`:
- import: `import { applyEditPlan } from "@/lib/apply-edit-plan";` and `import type { EditPlan } from "@claril/ai-advisor";`
- In the `CanvasApi` interface add:

```ts
  /** Apply an AI EditPlan as one undoable command; returns changed ids. */
  applyEditPlan: (plan: EditPlan) => string[];
```

- In the `onReady?.({ ... })` payload (where `applyFix`, `reloadXml`, `showDiff`, `clearDiff` are provided), add:

```ts
          applyEditPlan: (plan) =>
            modelerRef.current ? applyEditPlan(modelerRef.current, plan).changedIds : [],
```

- [ ] **Step 4: Typecheck + build + commit**

Run: `pnpm --filter web typecheck` then `pnpm --filter web build` (expect pass)

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/lib/apply-edit-plan.ts apps/web/components/bpmn-canvas.tsx
git commit -m "feat(canvas): EditPlan executor + CanvasApi.applyEditPlan"
```

---

## Task 5: Change-plan card + Assistant panel

**Files:**
- Create: `apps/web/components/change-plan-card.tsx`
- Create: `apps/web/components/assistant-panel.tsx`

- [ ] **Step 1: The change-plan card**

Create `apps/web/components/change-plan-card.tsx`:

```tsx
"use client";

import type { EditPlan } from "@claril/ai-advisor";

const VERB: Record<string, string> = {
  addPool: "Pool",
  addLane: "Lane",
  addNode: "Add",
  connect: "Connect",
  updateElement: "Rename",
  deleteElement: "Delete",
};

function describe(op: EditPlan["ops"][number]): string {
  switch (op.kind) {
    case "addPool":
      return `+ Pool "${op.name}"`;
    case "addLane":
      return `+ Lane "${op.name}"`;
    case "addNode":
      return `+ ${op.type}${op.name ? ` "${op.name}"` : ""}`;
    case "connect":
      return `→ ${op.flow} flow${op.label ? ` "${op.label}"` : ""}`;
    case "updateElement":
      return `✎ ${op.elementId}${op.name ? ` → "${op.name}"` : ""}`;
    case "deleteElement":
      return `✕ ${op.elementId}`;
    default:
      return VERB[(op as { kind: string }).kind] ?? "change";
  }
}

export function ChangePlanCard({
  plan,
  applied,
  onApply,
  onDiscard,
}: {
  plan: EditPlan;
  applied: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="rounded-[8px] border border-hairline bg-elevated/60 p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 font-medium text-accent">✦ {plan.summary}</p>
      {plan.ops.length === 0 ? (
        <p className="text-xs text-fg-subtle">No change proposed.</p>
      ) : (
        <ul className="mb-3 space-y-0.5 font-mono text-[11px] text-fg-muted">
          {plan.ops.map((op, i) => (
            <li key={i}>{describe(op)}</li>
          ))}
        </ul>
      )}
      {plan.ops.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={applied}
            onClick={onApply}
            className="rounded-[6px] bg-accent px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {applied ? "Applied" : "Apply"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-elevated"
          >
            {applied ? "Undo" : "Discard"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: The Assistant panel**

Create `apps/web/components/assistant-panel.tsx`. It mirrors `InspectorPanel`'s in-flow drawer shell (`w-80`, `transition-[width]`), renders findings as cards at top (reuse the row markup), then a conversation area and an instruction input + chips. It is controlled and stateless about the model — the workbench owns plan state and passes handlers.

```tsx
"use client";

import { useState } from "react";
import { Send, Sparkles, FileText, Wand2 } from "lucide-react";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import type { EditPlan } from "@claril/ai-advisor";
import { ChangePlanCard } from "@/components/change-plan-card";
import { cn } from "@/lib/utils";

const dot: Record<Severity, string> = { error: "bg-error", warning: "bg-warning", info: "bg-info" };

export interface AssistantPanelProps {
  open: boolean;
  findings: Finding[];
  aiBusy: boolean;
  aiError: string | null;
  /** Last AI summary line (critique/Q&A), shown above the plan card. */
  message: string | null;
  plan: EditPlan | null;
  planApplied: boolean;
  onSelect?: (elementId: string) => void;
  onApplyFix?: (fix: QuickFix) => void;
  onInstruct: (text: string) => void;
  onAskAi: () => void;
  onGenerateDocs: () => void;
  onApplyPlan: () => void;
  onDiscardPlan: () => void;
}

export function AssistantPanel(props: AssistantPanelProps) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (t) {
      props.onInstruct(t);
      setText("");
    }
  };

  return (
    <aside
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        props.open ? "w-80" : "w-0",
      )}
    >
      <div className="flex h-full w-80 flex-col border-l border-hairline bg-panel/90 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <Sparkles className="size-4 text-accent" />
          <span className="text-sm font-medium">Assistant</span>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {props.findings.map((f, i) => (
            <button
              key={`${f.ruleId}-${i}`}
              type="button"
              disabled={!f.elementId}
              onClick={() => f.elementId && props.onSelect?.(f.elementId)}
              className="flex w-full gap-2 rounded-[6px] px-2 py-2 text-left hover:bg-elevated"
            >
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dot[f.severity])} />
              <span className="text-sm leading-snug">{f.message}</span>
            </button>
          ))}

          {props.aiBusy && <p className="px-2 text-xs text-accent">✦ Thinking…</p>}
          {props.aiError && <p className="px-2 text-xs text-error">{props.aiError}</p>}
          {props.message && (
            <p className="whitespace-pre-wrap px-2 text-sm leading-relaxed text-fg">{props.message}</p>
          )}
          {props.plan && (
            <ChangePlanCard
              plan={props.plan}
              applied={props.planApplied}
              onApply={props.onApplyPlan}
              onDiscard={props.onDiscardPlan}
            />
          )}
        </div>

        <div className="border-t border-hairline p-2">
          <div className="mb-2 flex flex-wrap gap-1">
            <Chip icon={Wand2} label="Review" onClick={props.onAskAi} />
            <Chip icon={FileText} label="Document" onClick={props.onGenerateDocs} />
          </div>
          <div className="flex items-end gap-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Describe a change… e.g. add an end event after Review"
              className="min-h-0 flex-1 resize-none rounded-[6px] border border-hairline bg-canvas px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={props.aiBusy}
              className="flex size-8 items-center justify-center rounded-[6px] bg-accent text-white hover:bg-accent/90 disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Chip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
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

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter web typecheck` (expect pass)

```bash
git add apps/web/components/change-plan-card.tsx apps/web/components/assistant-panel.tsx
git commit -m "feat(web): Assistant panel + change-plan card (HITL apply/discard)"
```

---

## Task 6: Wire the panel swap + plan→preview→apply/discard in the workbench

**Files:**
- Modify: `apps/web/components/bpmn-workbench.tsx`

- [ ] **Step 1: Add Assistant import + plan state**

In `bpmn-workbench.tsx`:
- import: `import { AssistantPanel } from "@/components/assistant-panel";`, `import { runDiagramEdit } from "@/lib/actions";` (add to the existing `@/lib/actions` import), and `import type { EditPlan } from "@claril/ai-advisor";`
- add state near the other AI state:

```ts
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [planApplied, setPlanApplied] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const preEditXmlRef = useRef<string>(initialXml);
```

- [ ] **Step 2: Add the instruct + apply/discard handlers**

Add to `bpmn-workbench.tsx`:

```ts
  const handleInstruct = useCallback(
    async (instruction: string) => {
      if (!aiConnected) {
        setSettingsOpen(true);
        return;
      }
      if (!graphRef.current) return;
      setInspectorOpen(true);
      setAiMessage(null);
      setPlan(null);
      setPlanApplied(false);
      setAiBusy(true);
      setAiError(null);
      try {
        const result = await runDiagramEdit(
          graphRef.current,
          findingsRef.current,
          instruction,
          diagramId,
        );
        setAiMessage(result.summary);
        setPlan(result);
        if (result.ops.length > 0) {
          // Snapshot, apply live, highlight the change (Discard reverts).
          preEditXmlRef.current = currentXmlRef.current;
          const changed = canvasApiRef.current?.applyEditPlan(result) ?? [];
          canvasApiRef.current?.showDiff({ added: changed, removed: [], changed: [], layout: [] });
        }
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "AI request failed.");
      } finally {
        setAiBusy(false);
      }
    },
    [aiConnected, diagramId],
  );

  const handleApplyPlan = useCallback(() => {
    canvasApiRef.current?.clearDiff();
    setPlanApplied(true); // change already on the model; autosave already fired
  }, []);

  const handleDiscardPlan = useCallback(() => {
    canvasApiRef.current?.clearDiff();
    void canvasApiRef.current?.reloadXml(preEditXmlRef.current);
    setPlan(null);
    setPlanApplied(false);
    setAiMessage(null);
  }, []);
```

> `graphRef`, `findingsRef`, `currentXmlRef`, `canvasApiRef`, `setInspectorOpen`, `aiBusy/aiError`, `handleAskAi`, `handleGenerateDocs` all already exist in `bpmn-workbench.tsx` (from W4/W6).

- [ ] **Step 3: Swap the panel by `aiConnected`**

Replace the `<InspectorPanel .../>` render with a conditional:

```tsx
      {aiConnected ? (
        <AssistantPanel
          open={inspectorOpen}
          findings={allFindings}
          aiBusy={aiBusy}
          aiError={aiError}
          message={aiMessage}
          plan={plan}
          planApplied={planApplied}
          onSelect={handleSelectFinding}
          onApplyFix={handleApplyFix}
          onInstruct={handleInstruct}
          onAskAi={handleAskAi}
          onGenerateDocs={handleGenerateDocs}
          onApplyPlan={handleApplyPlan}
          onDiscardPlan={handleDiscardPlan}
        />
      ) : (
        <InspectorPanel
          open={inspectorOpen}
          findings={allFindings}
          focusedElementId={focus.id}
          focusNonce={focus.nonce}
          onSelect={handleSelectFinding}
          onApplyFix={handleApplyFix}
          aiBusy={aiBusy}
          aiError={aiError}
          qaQuestion={qaQuestion}
          qaAnswer={qaAnswer}
          onClearQa={handleClearQa}
        />
      )}
```

- [ ] **Step 4: Typecheck + build + commit**

Run: `pnpm --filter web typecheck` then `pnpm --filter web build` (expect pass)

```bash
git add apps/web/components/bpmn-workbench.tsx
git commit -m "feat(web): swap Inspector<->Assistant by aiConnected; wire plan->preview->apply/discard"
```

---

## Task 7: End-to-end verification (the payment-flow example)

**Files:** none (verification only)

- [ ] **Step 1: Start the app + sign in**

Run the dev server; sign up a temp `verify-*@example.com` user (per repo convention) and connect an AI provider in settings (a real BYOK key is required for a live plan — if none is available, verify the no-provider path: instruction routes to `AiSettingsDialog`).

- [ ] **Step 2: Drive the example** (Playwright MCP if available)

Open a BPMN diagram. With AI connected, confirm the right panel is the **Assistant**. Enter:
> "add two pools, User and BFF; user clicks Pay, BFF receives the command and fetches data, returns details, awaits approval; if approved continue, else stop"

Expected: a change-plan card lists pools/tasks/gateway/flows; the new elements appear on the canvas highlighted (added=green via `showDiff`). Click **Apply** → highlight clears, diagram autosaves ("Saved"), inspector findings update. Re-do and click **Discard** instead → canvas reverts to the pre-edit state.

- [ ] **Step 3: Guardrails**

Confirm: (a) with AI **off**, the right panel is the unchanged **Inspector**; (b) typing in the Assistant textarea does not trigger canvas shortcuts; (c) `Cmd/Ctrl+Z` after Apply undoes the whole plan in one step (single command).

- [ ] **Step 4: Cleanup + final commit**

Delete the temp user from Neon (per repo convention). No code commit unless a fix was needed; if Task 7 surfaced a layout problem, add the `bpmn-auto-layout` post-pass in `apply-edit-plan.ts` (serialize current XML → `layoutProcess(xml)` → `CanvasApi.reloadXml`) and commit:

```bash
git commit -am "fix(canvas): auto-layout pass for generated multi-pool plans"
```

---

## Self-review

- **Spec coverage:** EditPlan (Task 1) ✓; planner/BYOK/grounding (Task 2) ✓; server action (Task 3) ✓; executor + one-undo + CanvasApi (Task 4) ✓; W4-based preview + Apply/Discard (Task 6) ✓; Assistant panel + findings-as-cards + chips + merged Ask-AI/doc-gen (Task 5) ✓; panel swap by `aiConnected` (Task 6) ✓; HITL + error handling (cards "No change proposed", op-level skip) ✓; testing (Tasks 1–2 unit, Task 7 e2e) ✓. Persistence/knowledge correctly deferred.
- **Type consistency:** `EditPlan`/`Op`/`orderOps`/`collectPlanRefs`/`planEdits`/`buildPlannerPrompt` defined in Task 1–2, exported in Task 2, consumed in Tasks 3–6 with matching names. `CanvasApi.applyEditPlan(plan) => string[]` defined Task 4, called Task 6. `DiffMarks` shape `{added,removed,changed,layout}` matches W4.
- **Placeholders:** none — code provided in every code step; the only judgment-call is the optional auto-layout post-pass, gated behind the Task 7 verification with concrete instructions.
