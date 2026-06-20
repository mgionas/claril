# BPMN Editing Capabilities — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Complete the element palette the planner can create — the rest of the BPMN task types, the remaining gateways, and sub-processes (as containers you can add nodes into).

**Architecture:** Mostly additive — extend `NODE_TYPES` (the planner's allowed `addNode` types, surfaced in the prompt automatically) and the `BPMN_TYPE` map (apply → bpmn-js element factory). Sub-process needs a small apply special-case (created expanded so it can hold children) and reuses the existing `containerRef`/`moveToContainer` plumbing for placing/reparenting nodes inside it.

**Spec:** `docs/superpowers/specs/2026-06-21-bpmn-editing-capabilities.md` (Phase 2).

**Files:** `packages/ai-advisor/src/edit-plan.ts`, `packages/ai-advisor/src/edit-plan.test.ts`, `apps/web/lib/apply-edit-plan.ts`, `apps/web/components/chat-element-chip.tsx`, `packages/ai-advisor/src/planner.ts`.

---

### Task 1: Expand task + gateway palette

Add the missing activity and gateway types. The planner prompt's `addNode` line is generated from `NODE_TYPES`, so new types appear automatically.

**Files:** `edit-plan.ts`, `apply-edit-plan.ts`, `chat-element-chip.tsx`, `edit-plan.test.ts`

- [ ] **Step 1: Extend `NODE_TYPES`**

In `packages/ai-advisor/src/edit-plan.ts`, add to the `NODE_TYPES` tuple (keep existing entries):
```tsx
export const NODE_TYPES = [
  "startEvent",
  "endEvent",
  "task",
  "userTask",
  "serviceTask",
  "sendTask",
  "receiveTask",
  "scriptTask",
  "businessRuleTask",
  "manualTask",
  "callActivity",
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "eventBasedGateway",
  "complexGateway",
  "intermediateThrowEvent",
  "intermediateCatchEvent",
] as const;
```

- [ ] **Step 2: Extend the `BPMN_TYPE` map (apply)**

In `apps/web/lib/apply-edit-plan.ts`, add the bpmn-js types to `BPMN_TYPE`:
```tsx
const BPMN_TYPE: Record<string, string> = {
  startEvent: "bpmn:StartEvent",
  endEvent: "bpmn:EndEvent",
  task: "bpmn:Task",
  userTask: "bpmn:UserTask",
  serviceTask: "bpmn:ServiceTask",
  sendTask: "bpmn:SendTask",
  receiveTask: "bpmn:ReceiveTask",
  scriptTask: "bpmn:ScriptTask",
  businessRuleTask: "bpmn:BusinessRuleTask",
  manualTask: "bpmn:ManualTask",
  callActivity: "bpmn:CallActivity",
  exclusiveGateway: "bpmn:ExclusiveGateway",
  parallelGateway: "bpmn:ParallelGateway",
  inclusiveGateway: "bpmn:InclusiveGateway",
  eventBasedGateway: "bpmn:EventBasedGateway",
  complexGateway: "bpmn:ComplexGateway",
  intermediateThrowEvent: "bpmn:IntermediateThrowEvent",
  intermediateCatchEvent: "bpmn:IntermediateCatchEvent",
};
```
(No other apply change — `elementFactory.createShape({ type })` handles all of these.)

- [ ] **Step 3: Chip icons for the two not yet mapped**

In `apps/web/components/chat-element-chip.tsx`, the `TYPE_ICON` map already covers most types. Add the two missing and import their icons:
```tsx
  callActivity: PhoneCall,
  complexGateway: Diamond,
```
Add `PhoneCall` to the lucide-react import (Diamond is already imported). (sendTask/receiveTask/scriptTask/manualTask/businessRuleTask/inclusiveGateway/eventBasedGateway are already present — verify; add any that are missing.)

- [ ] **Step 4: Schema test**

In `packages/ai-advisor/src/edit-plan.test.ts`, add:
```tsx
it("accepts addNode for new task and gateway types", () => {
  const parsed = EditPlanSchema.safeParse({
    summary: "Add a send task and an inclusive gateway",
    ops: [
      { kind: "addNode", tempId: "t1", type: "sendTask", name: "Notify" },
      { kind: "addNode", tempId: "t2", type: "inclusiveGateway", name: "Which?" },
    ],
  });
  expect(parsed.success).toBe(true);
});
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @claril/ai-advisor typecheck` · `pnpm --filter @claril/ai-advisor exec vitest run` · `pnpm --filter web typecheck` · `pnpm --filter web build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ai-advisor/src/edit-plan.ts packages/ai-advisor/src/edit-plan.test.ts apps/web/lib/apply-edit-plan.ts apps/web/components/chat-element-chip.tsx
git commit -m "$(cat <<'EOF'
feat(ai): full task + gateway palette for addNode

Adds send/receive/script/businessRule/manual tasks, callActivity, and
inclusive/eventBased/complex gateways to NODE_TYPES + the apply BPMN_TYPE
map (+ chip icons). Planner prompt picks them up from NODE_TYPES.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Sub-process (expanded container)

Let the planner create an (expanded) sub-process and add nodes into it via `containerRef`.

**Files:** `edit-plan.ts`, `apply-edit-plan.ts`, `planner.ts`, `edit-plan.test.ts`

- [ ] **Step 1: Add `subProcess` to `NODE_TYPES`**

Append `"subProcess"` to the `NODE_TYPES` tuple in `edit-plan.ts`.

- [ ] **Step 2: Apply — create an expanded sub-process**

In `apps/web/lib/apply-edit-plan.ts`:
- Add to `BPMN_TYPE`: `subProcess: "bpmn:SubProcess",`.
- In the `addNode` case, build the shape so a sub-process is created **expanded** (so it can hold children) with a sensible size. Replace the shape-creation line:
```tsx
        const type = BPMN_TYPE[op.type];
        const shape =
          op.type === "subProcess"
            ? elementFactory.createShape({ type, isExpanded: true, width: 350, height: 200 })
            : elementFactory.createShape({ type });
```
The rest of the `addNode` handler (placement, containerRef, insert/append) is unchanged — a sub-process places like any node.

- [ ] **Step 3: Planner prompt note**

In `planner.ts`, add a rule (in the `Rules:` list) so the planner uses sub-processes correctly:
```
- A subProcess is a CONTAINER: after addNode with type "subProcess", you can place new nodes inside it by setting their containerRef to the subProcess's tempId, and move existing elements into it with moveToContainer (containerRef = the subProcess id). Wire the subProcess into the flow like any other node.
```

- [ ] **Step 4: Schema test**

```tsx
it("accepts a subProcess node + a child placed via containerRef", () => {
  const parsed = EditPlanSchema.safeParse({
    summary: "Add a subprocess with a task inside",
    ops: [
      { kind: "addNode", tempId: "sp", type: "subProcess", name: "Handle claim" },
      { kind: "addNode", tempId: "t1", type: "task", name: "Assess", containerRef: "sp" },
    ],
  });
  expect(parsed.success).toBe(true);
});
```

- [ ] **Step 5: Verify** (same four commands as Task 1 Step 5) → all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ai-advisor/src/edit-plan.ts packages/ai-advisor/src/edit-plan.test.ts apps/web/lib/apply-edit-plan.ts packages/ai-advisor/src/planner.ts
git commit -m "$(cat <<'EOF'
feat(ai): sub-process support (expanded container)

addNode type subProcess creates an expanded bpmn:SubProcess; nodes can be
placed inside via containerRef (and moved in via moveToContainer). Planner
prompt explains the container semantics. Schema unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Manual verification

**Files:** none (needs AI provider; local).

- [ ] **Step 1: Restart `pnpm dev`** (package changes), then:
1. *"add a service task 'Charge card' after X"* and *"add an inclusive gateway after Y"* → nodes of the correct **type** appear (service-task icon, inclusive-gateway shape).
2. *"add a send task and a receive task"* → both render with the right markers.
3. *"add a subprocess 'Handle dispute' and put a task 'Review evidence' inside it"* → an expanded sub-process appears with the task nested inside.
4. *"move check user into the Handle dispute subprocess"* → `moveToContainer` reparents it (Phase 1 op).

Expected: correct element types render; sub-process holds its children. Note any deviation (the `[applyEditPlan]` debug logs show op resolution).

---

## Self-Review
- Spec Phase 2 items: more task types (Task 1), more gateways (Task 1), sub-process + reparent (Task 2 + reuse Phase-1 moveToContainer/containerRef). ✓
- `NODE_TYPES` is the single source for both schema validation and the planner prompt (auto-surfaced) — adding a type there + in `BPMN_TYPE` is sufficient for create. ✓
- Sub-process is the only type needing an apply special-case (expanded + size). ✓
- Gemini-safe: `addNode.type` is a `z.enum(NODE_TYPES)` (still a single enum, no union nesting). ✓
- Grounding already lists each node's `type`, so the AI sees the new types in existing diagrams. ✓

## Out of scope (later phases)
- Event definitions (timer/message/error), activity markers, conditional/default flows → Phase 3.
- Data objects/artifacts, property ops → Phase 4.
