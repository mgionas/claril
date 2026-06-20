# BPMN Editing Capabilities — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stop misleading no-op plans, and add the two highest-value missing ops: **move an element into a different lane/pool** and **reconnect a flow's endpoints**.

**Architecture:** Additive ops on the discriminated-union `EditPlanSchema` (stays Gemini-safe via `generateText`+Zod). Each op gets: a schema variant, a `groupOps` display bucket (proposal card), an `applyEditPlan` handler (bpmn-js `modeling`), a planner-prompt contract line, and a schema unit test. A capability guard ships first so the planner declines unsupported requests instead of emitting no-op `updateElement`s.

**Spec:** `docs/superpowers/specs/2026-06-21-bpmn-editing-capabilities.md` (Phase 1).

**Files touched:** `packages/ai-advisor/src/edit-plan.ts`, `packages/ai-advisor/src/planner.ts`, `packages/ai-advisor/src/edit-plan.test.ts`, `apps/web/components/proposal-card.tsx`, `apps/web/lib/apply-edit-plan.ts`.

---

### Task 1: Capability guard (stopgap — ship first)

Make the planner decline unsupported requests with an empty plan + explanation, instead of emitting no-op ops.

**Files:** `packages/ai-advisor/src/planner.ts`

- [ ] **Step 1: Add the guard rule to `PLANNER_SYSTEM_PROMPT`**

In the `Rules:` list (after the existing rules, before the OUTPUT FORMAT block), add:
```
- You can ONLY use the operations defined in OUTPUT FORMAT below. updateElement changes an element's NAME only — it cannot move, reparent, or restyle anything. If the request needs an operation not available (e.g. set a flow condition, add a data object, change an event's type/definition, configure loop/multi-instance markers), DO NOT emit no-op or unrelated ops. Instead return {"summary": "<one line: what isn't supported yet + the closest supported alternative>", "ops": []}.
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @claril/ai-advisor typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ai-advisor/src/planner.ts
git commit -m "$(cat <<'EOF'
fix(ai): planner declines unsupported edits instead of no-op plans

Stops the "proposed updates but nothing changes" case — the planner now
returns an empty plan + explanation when a request needs an op it lacks,
rather than emitting no-op updateElement ops.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `moveToContainer` op (move element into a lane/pool)

**Files:** `packages/ai-advisor/src/edit-plan.ts`, `packages/ai-advisor/src/edit-plan.test.ts`, `apps/web/components/proposal-card.tsx`, `apps/web/lib/apply-edit-plan.ts`, `packages/ai-advisor/src/planner.ts`

- [ ] **Step 1: Schema variant + ordering**

In `edit-plan.ts`, add the variant and include it in `OpSchema` + `ORDER`:
```tsx
const MoveToContainer = z.object({
  kind: z.literal("moveToContainer"),
  /** id of the existing element to move. */
  elementId: z.string(),
  /** Target lane/pool — a tempId from this plan or an existing lane/pool id. */
  containerRef: z.string(),
});
```
Add `MoveToContainer` to the `z.discriminatedUnion("kind", [...])` array. Extend `ORDER`:
```tsx
const ORDER: Record<Op["kind"], number> = {
  addPool: 0,
  addLane: 1,
  addNode: 2,
  connect: 3,
  moveToContainer: 4,
  reconnect: 5,
  updateElement: 6,
  deleteElement: 7,
};
```
> Note: `reconnect` (Task 3) is added to ORDER here too so both tasks share one ORDER map; if Task 3 isn't done yet, leaving the key present is harmless (no op uses it). To keep the map type-correct (`Record<Op["kind"], number>`), add `reconnect` only once Task 3's variant exists — if doing Task 2 alone, omit `reconnect` from ORDER and renumber updateElement=5, deleteElement=6, then re-add in Task 3.

- [ ] **Step 2: Schema test**

In `edit-plan.test.ts`, add:
```tsx
it("accepts a moveToContainer op", () => {
  const parsed = EditPlanSchema.safeParse({
    summary: "Move task into the Back lane",
    ops: [{ kind: "moveToContainer", elementId: "Task_1", containerRef: "Lane_b" }],
  });
  expect(parsed.success).toBe(true);
});
```
(Import `EditPlanSchema` as the existing tests do.)

- [ ] **Step 3: Run the test (red→green)**

Run: `pnpm --filter @claril/ai-advisor exec vitest run src/edit-plan.test.ts`
Expected: PASS (the schema accepts it once Step 1 lands; if you wrote the test first it fails on the missing variant).

- [ ] **Step 4: `groupOps` display bucket**

In `apps/web/components/proposal-card.tsx`, extend `OpGroups` + `groupOps` + `SECTIONS`:
```tsx
export interface OpGroups {
  added: string[];
  connected: string[];
  moved: string[];
  updated: string[];
  removed: string[];
}
```
In `groupOps`, add a case:
```tsx
      case "moveToContainer": g.moved.push(`${op.elementId} → ${op.containerRef}`); break;
```
Initialize `moved: []` in the `g` object. Add a SECTIONS entry (import `Move` from lucide-react):
```tsx
  { key: "moved", icon: Move, label: "Move", tone: "text-info" },
```

- [ ] **Step 5: `applyEditPlan` handler**

In `apps/web/lib/apply-edit-plan.ts`, add a `mid` helper near the other helpers:
```tsx
  const mid = (el: any) => ({ x: el.x + (el.width ?? 0) / 2, y: el.y + (el.height ?? 0) / 2 });
```
Add the case (after `connect`):
```tsx
      case "moveToContainer": {
        const el = resolve(op.elementId);
        const container = asFlowNodeContainer(resolve(op.containerRef));
        if (!el || !container || typeof el.y !== "number" || typeof container.y !== "number") {
          if (DEBUG) console.log("[applyEditPlan] moveToContainer unresolved:", op);
          return;
        }
        // Center the element vertically in the target lane/pool band; bpmn-js
        // LaneBehavior reassigns lane membership from the new position.
        const dy = container.y + (container.height ?? 0) / 2 - (el.y + (el.height ?? 0) / 2);
        modeling.moveElements([el], { x: 0, y: dy }, container);
        changed.add(el.id);
        return;
      }
```

- [ ] **Step 6: Planner prompt contract line**

In `planner.ts` OUTPUT FORMAT op list, add:
```
- {"kind":"moveToContainer","elementId":string,"containerRef":string}  // move an EXISTING element into a different lane/pool — containerRef is a lane/pool id from POOLS & LANES
```

- [ ] **Step 7: Typecheck + build + test**

Run: `pnpm --filter @claril/ai-advisor typecheck` · `pnpm --filter @claril/ai-advisor exec vitest run` · `pnpm --filter web typecheck` · `pnpm --filter web build`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ai-advisor/src/edit-plan.ts packages/ai-advisor/src/edit-plan.test.ts packages/ai-advisor/src/planner.ts apps/web/components/proposal-card.tsx apps/web/lib/apply-edit-plan.ts
git commit -m "$(cat <<'EOF'
feat(ai): moveToContainer op — move an element into a lane/pool

New EditPlan op + apply handler (bpmn-js moveElements into the target lane
band) + proposal-card "Move" bucket + planner contract. Schema unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `reconnect` op (re-point a flow's endpoints)

**Files:** `packages/ai-advisor/src/edit-plan.ts`, `packages/ai-advisor/src/edit-plan.test.ts`, `apps/web/components/proposal-card.tsx`, `apps/web/lib/apply-edit-plan.ts`, `packages/ai-advisor/src/planner.ts`

- [ ] **Step 1: Schema variant + ORDER**

```tsx
const Reconnect = z.object({
  kind: z.literal("reconnect"),
  /** id of an existing sequence/message flow. */
  flowId: z.string(),
  newSourceRef: z.string().optional(),
  newTargetRef: z.string().optional(),
});
```
Add to the discriminated union. Ensure `reconnect` is in `ORDER` (5, per Task 2's map).

- [ ] **Step 2: Schema test**

```tsx
it("accepts a reconnect op", () => {
  const parsed = EditPlanSchema.safeParse({
    summary: "Re-point a flow",
    ops: [{ kind: "reconnect", flowId: "Flow_1", newTargetRef: "Task_2" }],
  });
  expect(parsed.success).toBe(true);
});
```

- [ ] **Step 3: Run test** — `pnpm --filter @claril/ai-advisor exec vitest run src/edit-plan.test.ts` → PASS.

- [ ] **Step 4: `groupOps` bucket**

Add `reconnected: string[]` to `OpGroups`, init `reconnected: []`, and:
```tsx
      case "reconnect": g.reconnected.push(op.flowId); break;
```
SECTIONS entry (import `Spline` or reuse `ArrowRight`; use `Cable` if available, else `ArrowRight`):
```tsx
  { key: "reconnected", icon: ArrowRight, label: "Reconnect", tone: "text-info" },
```

- [ ] **Step 5: `applyEditPlan` handler**

```tsx
      case "reconnect": {
        const conn = resolve(op.flowId);
        if (!conn) {
          if (DEBUG) console.log("[applyEditPlan] reconnect: flow not found:", op);
          return;
        }
        if (op.newSourceRef) {
          const ns = resolve(op.newSourceRef);
          if (ns) modeling.reconnectStart(conn, ns, mid(ns));
        }
        if (op.newTargetRef) {
          const nt = resolve(op.newTargetRef);
          if (nt) modeling.reconnectEnd(conn, nt, mid(nt));
        }
        changed.add(conn.id);
        return;
      }
```
(`mid` added in Task 2.)

- [ ] **Step 6: Planner prompt contract line**

```
- {"kind":"reconnect","flowId":string,"newSourceRef"?:string,"newTargetRef"?:string}  // re-point an existing flow (id from FLOWS) to a new source and/or target instead of delete+recreate
```

- [ ] **Step 7: Typecheck + build + test** (same commands as Task 2 Step 7) → all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ai-advisor/src/edit-plan.ts packages/ai-advisor/src/edit-plan.test.ts packages/ai-advisor/src/planner.ts apps/web/components/proposal-card.tsx apps/web/lib/apply-edit-plan.ts
git commit -m "$(cat <<'EOF'
feat(ai): reconnect op — re-point a flow's source/target

New EditPlan op + apply handler (bpmn-js reconnectStart/reconnectEnd) +
proposal-card bucket + planner contract. Schema unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual verification

**Files:** none (needs AI provider; local).

- [ ] **Step 1: Restart `pnpm dev`** (package changes), then:
1. Ask *"move check user into the Back lane"* → proposal card shows a **Move** entry; Approve → the element shifts into that lane (and lane membership updates).
2. Ask *"reconnect the flow from X so it goes to Y instead"* → card shows **Reconnect**; Approve → the flow re-points.
3. Ask for something unsupported, e.g. *"add a data store"* → the assistant **declines with an explanation** (empty plan, no misleading "Applied" card).

Expected: all as described; note any deviation. (Apply handlers are bpmn-js-specific and only verifiable at runtime — the `[applyEditPlan]` debug logs show resolution.)

---

## Self-Review
- Spec Phase 1 items: capability guard (Task 1 ✓), moveToContainer (Task 2 ✓), reconnect (Task 3 ✓).
- Each new op: schema + ORDER + groupOps bucket + apply handler + planner contract + schema test. ✓
- Gemini-safe: ops remain a flat discriminated union; `generateText`+Zod path unchanged. ✓
- ORDER map kept consistent across Tasks 2+3 (note in Task 2 Step 1). Verify `Record<Op["kind"], number>` stays exhaustive after both.
- Apply handlers reuse existing `resolve`/`asFlowNodeContainer`/`DEBUG`; `mid` added once (Task 2), used by Task 3.
