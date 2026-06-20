# BPMN Editing Capabilities — Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Data & artifacts + a documentation property op — so the AI can model **data objects, data stores, text annotations** (with associations) and set **element documentation**. Also fixes a latent extraction bug where these element types are mis-captured as flow nodes.

**Architecture:** Add an `artifacts` list to `ProcessGraph` (optional; analysis ignores it). Fix `bpmn-to-graph` to categorise data/artifact/association elements correctly (today they fall through into `nodes`). New flat `EditPlan` ops (`addArtifact`, `associate`, `setDocumentation`) with apply handlers via bpmn-js `modeling`/`bpmnFactory`. Union stays flat (Gemini-safe). Schema/grounding/validation are unit-tested; apply is runtime-verified.

**Spec:** `docs/superpowers/specs/2026-06-21-bpmn-editing-capabilities.md` (Phase 4).

**Out of scope (deferred):** user-task assignment (vendor extension, no plain-BPMN render), asset-binding via `proposeEdit` (separate DB subsystem, not a bpmn-js edit).

---

### Task 1: Model + faithful extraction of data/artifacts

**Files:** `packages/logic-inspector/src/types.ts`, `apps/web/lib/bpmn-to-graph.ts`, `packages/ai-advisor/src/advisor.ts` (describeGraph), `packages/ai-advisor/src/synopsis.ts` (describeSynopsis + graphHash), `packages/ai-advisor/src/synopsis.test.ts`

- [ ] **Step 1: Type**

In `types.ts`, add and wire into `ProcessGraph`:
```tsx
/** A non-flow element: data object/store or text annotation. */
export interface ArtifactInfo {
  id: string;
  kind: "dataObject" | "dataStore" | "textAnnotation";
  name?: string;
}
```
Add to `ProcessGraph`: `artifacts?: ArtifactInfo[];`

- [ ] **Step 2: Fix extraction** (`bpmn-to-graph.ts`)

Today every `bpmn:*` element that isn't a container/sequence/message flow becomes a `node` — so `bpmn:DataObjectReference`, `bpmn:TextAnnotation`, and association connections are wrongly modelled as flow nodes. Fix:
```tsx
const ARTIFACT_KIND: Record<string, "dataObject" | "dataStore" | "textAnnotation"> = {
  "bpmn:DataObjectReference": "dataObject",
  "bpmn:DataStoreReference": "dataStore",
  "bpmn:TextAnnotation": "textAnnotation",
};
const NON_NODE_CONNECTIONS = new Set([
  "bpmn:Association",
  "bpmn:DataInputAssociation",
  "bpmn:DataOutputAssociation",
]);
```
In the second pass, BEFORE the generic node push:
```tsx
    if (ARTIFACT_KIND[type]) {
      artifacts.push({
        id: el.id,
        kind: ARTIFACT_KIND[type],
        name: type === "bpmn:TextAnnotation" ? el.businessObject?.text : el.businessObject?.name,
      });
      continue;
    }
    if (NON_NODE_CONNECTIONS.has(type)) continue;
```
(Add `const artifacts: ArtifactInfo[] = [];` and `if (artifacts.length) graph.artifacts = artifacts;`. Also extend the `DiElement.businessObject` slice with `text?: string` for annotations. Note `bpmn:DataObjectReference`/`DataStoreReference` carry `name`; `TextAnnotation` carries `text`.)

- [ ] **Step 3: Grounding** — describe artifacts

`describeSynopsis` (synopsis.ts): add a section when artifacts exist:
```tsx
  const artifacts = graph.artifacts ?? [];
  ...
  if (artifacts.length > 0) {
    blocks.push(
      "",
      "DATA & ARTIFACTS:",
      artifacts.map((a) => `- ${a.id} [${a.kind}]${a.name ? ` "${a.name}"` : ""}`).join("\n"),
    );
  }
```
Include artifacts in `graphHash` canon (`${a.id}|${a.kind}|${a.name ?? ""}`).
`describeGraph` (advisor.ts): append an `ARTIFACTS:` section the same way.

- [ ] **Step 4: Test** (synopsis.test.ts) — a graph with an artifact renders the section + hash changes when an artifact is added. Verify + commit.

```bash
git add packages/logic-inspector/src/types.ts apps/web/lib/bpmn-to-graph.ts packages/ai-advisor/src/advisor.ts packages/ai-advisor/src/synopsis.ts packages/ai-advisor/src/synopsis.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): model data objects / stores / text annotations in the graph

ProcessGraph.artifacts + faithful extraction (previously data/annotation/
association elements were mis-captured as flow nodes); surfaced in chat +
planner grounding (DATA & ARTIFACTS). Unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify (this task): `pnpm --filter @claril/logic-inspector typecheck` · `pnpm --filter @claril/ai-advisor exec vitest run` · `pnpm --filter @claril/ai-advisor typecheck` · `pnpm --filter web typecheck` · `pnpm --filter web build`.

---

### Task 2: Create ops — `addArtifact` + `associate`

**Files:** `packages/ai-advisor/src/edit-plan.ts`, `packages/ai-advisor/src/edit-plan.test.ts`, `apps/web/lib/apply-edit-plan.ts`, `apps/web/components/proposal-card.tsx`, `packages/ai-advisor/src/planner.ts`

- [ ] **Step 1: Schema** (`edit-plan.ts`)
```tsx
const AddArtifact = z.object({
  kind: z.literal("addArtifact"),
  tempId: z.string(),
  artifact: z.enum(["dataObject", "dataStore", "textAnnotation"]),
  name: z.string().optional(),
  text: z.string().optional(), // text annotation body
});
const Associate = z.object({
  kind: z.literal("associate"),
  fromRef: z.string(),
  toRef: z.string(),
});
```
Add both to the union. Update `ORDER`: `addArtifact` right after `addNode` (so it can be associated later), `associate` after `connect`. Re-state the full exhaustive map.
Extend `collectPlanRefs` to also add `addArtifact` tempIds to `defined`.

- [ ] **Step 2: Validation** (`validateEditPlan` in edit-plan.ts)
- `addArtifact` tempId is a defined ref (add to the tempIds set; note artifacts are NOT subject to the orphan/connect check — only `addNode` flow nodes are).
- `associate` refs (`fromRef`,`toRef`) must each be `known`.

- [ ] **Step 3: Schema test** — accepts addArtifact + associate.

- [ ] **Step 4: Apply** (`apply-edit-plan.ts`)
Add a type map:
```tsx
const ARTIFACT_BPMN: Record<string, string> = {
  dataObject: "bpmn:DataObjectReference",
  dataStore: "bpmn:DataStoreReference",
  textAnnotation: "bpmn:TextAnnotation",
};
```
`addArtifact` case (place near a connected element if any, else a default offset; never on the collaboration root):
```tsx
      case "addArtifact": {
        const shape = elementFactory.createShape({ type: ARTIFACT_BPMN[op.artifact] });
        const anchor = findArtifactAnchor(op.tempId); // element referenced by an associate, if placed
        const parent = asFlowNodeContainer(anchor?.parent ?? root);
        const position = anchor
          ? { x: anchor.x + (anchor.width ?? 0) / 2, y: anchor.y + (anchor.height ?? 0) + 90 }
          : { x: 300, y: 320 };
        const placed = modeling.createShape(shape, position, parent);
        if (op.artifact === "textAnnotation" && op.text) modeling.updateProperties(placed, { text: op.text });
        else if (op.name) modeling.updateProperties(placed, { name: op.name });
        temp.set(op.tempId, placed);
        changed.add(placed.id);
        return;
      }
```
`associate` case — bpmn-js infers the connection type (DataAssociation / Association) from the endpoints:
```tsx
      case "associate": {
        const from = resolve(op.fromRef);
        const to = resolve(op.toRef);
        if (!from || !to) return;
        const conn = modeling.connect(from, to);
        if (conn) changed.add(conn.id);
        return;
      }
```
Add `findArtifactAnchor(tempId)`: scan `associate` ops referencing the tempId, return the resolved *other* endpoint if positioned (mirror `findNeighbor`).

- [ ] **Step 5: proposal-card** — `groupOps`: `addArtifact` → `added` bucket (`${op.artifact}${op.name? …}`); `associate` → `connected` bucket (`association`).

- [ ] **Step 6: planner prompt** — add the two op contract lines + a rule: "Data objects/stores and text annotations are artifacts created with addArtifact, then linked to an activity (or, for an annotation, any element) with associate — NOT connect. Don't wire them with sequence flows."

- [ ] **Step 7: Verify + commit** (typecheck ai-advisor + web, vitest, web build).
```bash
git commit -m "feat(ai): addArtifact + associate ops (data objects/stores/annotations) …"
```

---

### Task 3: `setDocumentation` property op

**Files:** `edit-plan.ts`, `edit-plan.test.ts`, `apply-edit-plan.ts`, `proposal-card.tsx`, `planner.ts`

- [ ] **Step 1: Schema** — `SetDocumentation { kind:"setDocumentation", elementId, text }`. Union + ORDER (near updateElement). Validate: `elementId` known.
- [ ] **Step 2: Test** — accepts setDocumentation.
- [ ] **Step 3: Apply**:
```tsx
      case "setDocumentation": {
        const el = resolve(op.elementId);
        if (!el) return;
        const docs = op.text ? [bpmnFactory.create("bpmn:Documentation", { text: op.text })] : [];
        modeling.updateProperties(el, { documentation: docs });
        changed.add(el.id);
        return;
      }
```
- [ ] **Step 4: groupOps** — `setDocumentation` → `updated` bucket (`${op.elementId} → docs`).
- [ ] **Step 5: prompt** — contract line + rule ("setDocumentation sets an element's description/documentation text").
- [ ] **Step 6: Verify + commit.**

---

### Task 4: Manual verification

- [ ] Restart `pnpm dev`, then: *"add a data store 'Customer DB' and link it to 'check user'"*, *"attach a note 'SLA: 2 days' to the approval gateway"*, *"document the 'check case' task: 'verifies the claim against policy'"*. Confirm: data store + association render; annotation + dotted association render; documentation set (visible in properties). Also confirm existing data objects in a diagram now appear in the AI's answers (grounding).

---

## Self-Review
- Spec Phase 4: data objects/stores + associations (Task 2), text annotations (Task 2), documentation (Task 3); extraction faithfulness (Task 1). ✓
- Deferred (noted): user-task assignment, asset binding via proposeEdit.
- Union stays flat; ORDER exhaustive after each task; validateEditPlan extended (associate refs; artifacts exempt from orphan check); groupOps + prompt updated per op.
- Grounding now lists artifacts so the AI sees existing data/annotations (closes the extraction blind spot for these types).
