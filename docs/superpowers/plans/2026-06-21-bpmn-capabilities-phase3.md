# BPMN Editing Capabilities — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Flow semantics + event/activity typing — conditional & default sequence flows, event definitions (timer/message/error/…), and activity markers (loop / multi-instance / compensation).

**Architecture:** Extend existing ops (`connect`, `addNode`) with optional fields, plus two small ops for existing elements (`setFlow`, `setMarker`). Apply uses bpmn-js `bpmnFactory` (moddle elements), `bpmnReplace` (event definitions), and `modeling.updateProperties`. The op union stays a flat discriminated union (Gemini-safe). Apply handlers are bpmn-js-specific → verified at runtime; schema/prompt/groupOps are unit-tested.

**Spec:** `docs/superpowers/specs/2026-06-21-bpmn-editing-capabilities.md` (Phase 3).

**Setup (all tasks):** `applyEditPlan` must obtain two more services. In `apps/web/lib/apply-edit-plan.ts`, near the other `modeler.get(...)` calls, add:
```tsx
  const bpmnFactory = modeler.get("bpmnFactory");
  const bpmnReplace = modeler.get("bpmnReplace");
```
(Task 1 adds `bpmnFactory`; Task 2 adds `bpmnReplace`. Don't add a service before the task that uses it, to avoid unused-var lint.)

---

### Task 1: Conditional & default sequence flows

**Files:** `edit-plan.ts`, `edit-plan.test.ts`, `apply-edit-plan.ts`, `proposal-card.tsx`, `planner.ts`

- [ ] **Step 1: Schema — extend `connect`, add `setFlow`, update ORDER**

In `edit-plan.ts`, extend the `Connect` object with two optionals:
```tsx
const Connect = z.object({
  kind: z.literal("connect"),
  fromRef: z.string(),
  toRef: z.string(),
  label: z.string().optional(),
  flow: z.enum(["sequence", "message"]),
  /** A condition expression for this (sequence) flow, e.g. "amount > 1000". */
  condition: z.string().optional(),
  /** Mark this flow as the default outgoing flow of its source gateway. */
  isDefault: z.boolean().optional(),
});
```
Add a `SetFlow` variant for existing flows:
```tsx
const SetFlow = z.object({
  kind: z.literal("setFlow"),
  flowId: z.string(),
  condition: z.string().optional(),
  isDefault: z.boolean().optional(),
});
```
Add `SetFlow` to the discriminated union. Update `ORDER` (exhaustive over `Op["kind"]`):
```tsx
const ORDER: Record<Op["kind"], number> = {
  addPool: 0,
  addLane: 1,
  addNode: 2,
  connect: 3,
  setFlow: 4,
  moveToContainer: 5,
  reconnect: 6,
  updateElement: 7,
  deleteElement: 8,
};
```

- [ ] **Step 2: Schema test** (`edit-plan.test.ts`)
```tsx
it("accepts conditional/default connect and setFlow", () => {
  const parsed = EditPlanSchema.safeParse({
    summary: "Add a conditional branch",
    ops: [
      { kind: "connect", fromRef: "Gw_1", toRef: "Task_2", flow: "sequence", condition: "amount > 1000" },
      { kind: "setFlow", flowId: "Flow_9", isDefault: true },
    ],
  });
  expect(parsed.success).toBe(true);
});
```

- [ ] **Step 3: Apply — `bpmnFactory` + condition/default helpers + handlers**

In `apply-edit-plan.ts`, add `const bpmnFactory = modeler.get("bpmnFactory");` to the service gets. Add helpers near the others:
```tsx
  // Set or clear a sequence flow's condition expression.
  const applyCondition = (conn: any, condition?: string) => {
    if (condition === undefined) return;
    const expr = condition
      ? bpmnFactory.create("bpmn:FormalExpression", { body: condition })
      : undefined;
    modeling.updateProperties(conn, { conditionExpression: expr });
  };
  // Mark/unmark a flow as its source gateway's default.
  const applyDefault = (conn: any, isDefault?: boolean) => {
    if (isDefault === undefined || !conn.source) return;
    modeling.updateProperties(conn.source, { default: isDefault ? conn.businessObject : undefined });
  };
```
In the `connect` case, after `const conn = modeling.connect(from, to);` and the existing label handling, add:
```tsx
        if (conn) {
          applyCondition(conn, op.condition);
          applyDefault(conn, op.isDefault);
        }
```
Add a new `setFlow` case (after `connect`):
```tsx
      case "setFlow": {
        const conn = resolve(op.flowId);
        if (!conn) {
          if (DEBUG) console.log("[applyEditPlan] setFlow: flow not found:", op);
          return;
        }
        applyCondition(conn, op.condition);
        applyDefault(conn, op.isDefault);
        changed.add(conn.id);
        return;
      }
```

- [ ] **Step 4: proposal-card — show condition/default**

In `proposal-card.tsx` `groupOps`, update the `connect` case and add `setFlow`:
```tsx
      case "connect": {
        const extra = `${op.condition ? ` if ${op.condition}` : ""}${op.isDefault ? " (default)" : ""}`;
        g.connected.push(`${op.flow} flow${op.label ? ` "${op.label}"` : ""}${extra}`);
        break;
      }
      case "setFlow": {
        const bits = [op.condition ? `if ${op.condition}` : "", op.isDefault ? "default" : ""]
          .filter(Boolean)
          .join(", ");
        g.updated.push(`flow ${op.flowId}${bits ? ` → ${bits}` : ""}`);
        break;
      }
```
(Uses the existing `connected`/`updated` buckets — no new SECTIONS needed.)

- [ ] **Step 5: planner prompt** (`planner.ts`)

In the OUTPUT FORMAT op list, update the connect line and add setFlow:
```
- {"kind":"connect","fromRef":string,"toRef":string,"flow":"sequence"|"message","label"?:string,"condition"?:string,"isDefault"?:boolean}  // condition = expression for a conditional branch; isDefault marks a gateway's default outgoing flow
- {"kind":"setFlow","flowId":string,"condition"?:string,"isDefault"?:boolean}  // set/clear condition or default on an EXISTING flow (id from FLOWS)
```
Add a Rules line:
```
- For a gateway with conditional branches: give each non-default outgoing flow a condition, and mark exactly one branch isDefault (no condition on the default).
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @claril/ai-advisor typecheck` · `... exec vitest run` · `pnpm --filter web typecheck` · `pnpm --filter web build` → all PASS.
```bash
git add packages/ai-advisor/src/edit-plan.ts packages/ai-advisor/src/edit-plan.test.ts apps/web/lib/apply-edit-plan.ts apps/web/components/proposal-card.tsx packages/ai-advisor/src/planner.ts
git commit -m "$(cat <<'EOF'
feat(ai): conditional + default sequence flows

connect gains condition/isDefault; new setFlow op sets them on existing
flows. Apply via bpmnFactory FormalExpression + gateway default. Unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Event definitions

**Files:** `edit-plan.ts`, `edit-plan.test.ts`, `apply-edit-plan.ts`, `planner.ts`

- [ ] **Step 1: Schema — `addNode.eventDefinition`**

In `edit-plan.ts`, extend `AddNode`:
```tsx
  eventDefinition: z
    .enum(["timer", "message", "error", "signal", "escalation", "conditional", "compensation", "terminate"])
    .optional(),
```

- [ ] **Step 2: Schema test**
```tsx
it("accepts addNode with an event definition", () => {
  const parsed = EditPlanSchema.safeParse({
    summary: "Add a timer boundary event",
    ops: [{ kind: "addNode", tempId: "t1", type: "intermediateCatchEvent", name: "Wait 2d", eventDefinition: "timer" }],
  });
  expect(parsed.success).toBe(true);
});
```

- [ ] **Step 3: Apply — `bpmnReplace` to type the event**

In `apply-edit-plan.ts`, add `const bpmnReplace = modeler.get("bpmnReplace");` to the service gets. Add a map near `BPMN_TYPE`:
```tsx
const EVENT_DEF: Record<string, string> = {
  timer: "bpmn:TimerEventDefinition",
  message: "bpmn:MessageEventDefinition",
  error: "bpmn:ErrorEventDefinition",
  signal: "bpmn:SignalEventDefinition",
  escalation: "bpmn:EscalationEventDefinition",
  conditional: "bpmn:ConditionalEventDefinition",
  compensation: "bpmn:CompensateEventDefinition",
  terminate: "bpmn:TerminateEventDefinition",
};
```
In the `addNode` case, AFTER `placed` is created and named (just before `temp.set(op.tempId, placed)`), add:
```tsx
        if (op.eventDefinition && EVENT_DEF[op.eventDefinition] && /Event$/.test(BPMN_TYPE[op.type] ?? "")) {
          try {
            placed = bpmnReplace.replaceElement(placed, {
              type: BPMN_TYPE[op.type],
              eventDefinitionType: EVENT_DEF[op.eventDefinition],
            });
          } catch {
            /* keep the plain event if replace fails */
          }
        }
```
> `bpmnReplace.replaceElement` returns the new element — reassign `placed` so `temp`/`changed` track it. The `/Event$/` guard ensures we only do this for event nodes.

- [ ] **Step 4: planner prompt**

Update the addNode contract line to include the optional field, and add a rule:
```
- {"kind":"addNode","tempId":string,"type":<one of NODE_TYPES>,"name"?:string,"containerRef"?:string,"eventDefinition"?:"timer"|"message"|"error"|"signal"|"escalation"|"conditional"|"compensation"|"terminate"}
```
(Keep the `NODE_TYPES.map(...)` generation for the type union; append the `eventDefinition` field to that same line.) Rule:
```
- eventDefinition only applies to event nodes (start/end/intermediate events). Use it to make a timed/message/error event instead of a plain one.
```

- [ ] **Step 5: Verify + commit** (same four commands)
```bash
git add packages/ai-advisor/src/edit-plan.ts packages/ai-advisor/src/edit-plan.test.ts apps/web/lib/apply-edit-plan.ts packages/ai-advisor/src/planner.ts
git commit -m "$(cat <<'EOF'
feat(ai): event definitions on events (timer/message/error/…)

addNode gains eventDefinition; apply uses bpmnReplace to type the event.
Unit-tested at the schema level.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Activity markers

**Files:** `edit-plan.ts`, `edit-plan.test.ts`, `apply-edit-plan.ts`, `proposal-card.tsx`, `planner.ts`

- [ ] **Step 1: Schema — `addNode.marker` + `setMarker` op**

Extend `AddNode`:
```tsx
  marker: z
    .enum(["loop", "multiInstanceParallel", "multiInstanceSequential", "compensation"])
    .optional(),
```
Add a `SetMarker` variant (existing activities):
```tsx
const SetMarker = z.object({
  kind: z.literal("setMarker"),
  elementId: z.string(),
  marker: z.enum(["loop", "multiInstanceParallel", "multiInstanceSequential", "compensation", "none"]),
});
```
Add to the union; update `ORDER` to include `setMarker: 8` and bump `updateElement: 9`, `deleteElement: 10` (keep exhaustive).

- [ ] **Step 2: Schema test**
```tsx
it("accepts activity markers", () => {
  const parsed = EditPlanSchema.safeParse({
    summary: "Make a task multi-instance",
    ops: [
      { kind: "addNode", tempId: "t1", type: "task", name: "Review", marker: "multiInstanceParallel" },
      { kind: "setMarker", elementId: "Task_2", marker: "loop" },
    ],
  });
  expect(parsed.success).toBe(true);
});
```

- [ ] **Step 3: Apply — marker helper + handlers**

In `apply-edit-plan.ts`, add a helper:
```tsx
  const applyMarker = (el: any, marker: string) => {
    if (marker === "compensation") {
      modeling.updateProperties(el, { isForCompensation: true });
      return;
    }
    if (marker === "none") {
      modeling.updateProperties(el, { loopCharacteristics: undefined, isForCompensation: false });
      return;
    }
    const lc =
      marker === "loop"
        ? bpmnFactory.create("bpmn:StandardLoopCharacteristics")
        : bpmnFactory.create("bpmn:MultiInstanceLoopCharacteristics", {
            isSequential: marker === "multiInstanceSequential",
          });
    modeling.updateProperties(el, { loopCharacteristics: lc });
  };
```
In the `addNode` case, after `placed` is finalized (after the eventDefinition block), add:
```tsx
        if (op.marker) {
          try { applyMarker(placed, op.marker); } catch { /* best-effort */ }
        }
```
Add a `setMarker` case:
```tsx
      case "setMarker": {
        const el = resolve(op.elementId);
        if (!el) return;
        applyMarker(el, op.marker);
        changed.add(el.id);
        return;
      }
```

- [ ] **Step 4: proposal-card**

In `groupOps`, add:
```tsx
      case "setMarker": g.updated.push(`${op.elementId} → ${op.marker}`); break;
```
(addNode with a marker is already shown in the `added` bucket by type/name; no extra needed.)

- [ ] **Step 5: planner prompt**

Append `marker` to the addNode contract line and add `setMarker`:
```
- {"kind":"setMarker","elementId":string,"marker":"loop"|"multiInstanceParallel"|"multiInstanceSequential"|"compensation"|"none"}  // set/clear an activity marker on an existing task/subprocess
```
Rule:
```
- Markers (loop / multi-instance / compensation) apply to activities (tasks, sub-processes) — set on creation via addNode.marker or on an existing one via setMarker ("none" clears).
```

- [ ] **Step 6: Verify + commit** (same four commands)
```bash
git add packages/ai-advisor/src/edit-plan.ts packages/ai-advisor/src/edit-plan.test.ts apps/web/lib/apply-edit-plan.ts apps/web/components/proposal-card.tsx packages/ai-advisor/src/planner.ts
git commit -m "$(cat <<'EOF'
feat(ai): activity markers (loop / multi-instance / compensation)

addNode.marker + setMarker op; apply via loopCharacteristics /
isForCompensation. Unit-tested at the schema level.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual verification

**Files:** none (needs AI provider; local).

- [ ] **Step 1: Restart `pnpm dev`**, then:
1. *"add an exclusive gateway after X with branches: amount>1000 → review, else → auto-approve"* → gateway with a **conditional** branch + a **default** branch.
2. *"make the start event a timer event"* / *"add a message catch event"* → event renders with the right **definition icon**.
3. *"make the Review task multi-instance"* → task shows the multi-instance marker; *"add a loop to Assess"* → loop marker.

Expected: conditions/markers/event-defs render correctly. The `[applyEditPlan]` logs + the proposal card show what was applied.

---

## Self-Review
- Spec Phase 3: conditional + default flows (Task 1), event definitions (Task 2), activity markers (Task 3). ✓
- New ops `setFlow`, `setMarker`; extended `connect`, `addNode` — all flat union variants (Gemini-safe). ✓
- ORDER stays exhaustive across all three tasks (each task restates the full map). ✓ Verify the final map after Task 3 lists all 11 kinds once.
- Apply uses `bpmnFactory` (Task 1+3) and `bpmnReplace` (Task 2) — add each service only in the task that needs it. Event-definition reassigns `placed` (replaceElement returns a new element). ✓
- groupOps switch stays exhaustive over `op.kind` (TS enforces). ✓

## Out of scope (Phase 4+)
- Data objects/stores + associations, text annotations/groups, documentation/assignment props, asset binding via proposeEdit.
- Pool-safe full relayout, post-plan soundness validation.
