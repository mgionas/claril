# BPMN Editing Capabilities — Audit & Gap Plan

**Date:** 2026-06-21
**Goal:** Make Claril's AI a real **BPMN expert** — able to perform the full range of BPMN 2.0 editing operations through the `proposeEdit` → `EditPlan` → `applyEditPlan` pipeline, grounded on a faithful model. This document lists every capability, marks what exists, and plans the gaps.

**Pipeline today:** chat `proposeEdit(instruction)` → `planEdits` (`generateText` → Zod-validated `EditPlanSchema`) → `applyEditPlan(modeler, plan)` (bpmn-js `modeling`). Grounding = `describeGraph`/`describeSynopsis` (now lane/pool/message-flow aware) + findings + bound assets.

Legend: ✅ have · ⚠️ partial · ❌ missing.

---

## 1. Capability matrix

### A. Create — Events
| Capability | State | Notes |
|---|---|---|
| Start / End event | ✅ | `addNode` types `startEvent`,`endEvent` (in `NODE_TYPES` + `BPMN_TYPE`). |
| Intermediate throw / catch | ✅ | `intermediateThrowEvent`,`intermediateCatchEvent`. |
| Terminate end event | ❌ | No terminate event definition. |
| Boundary event (on activity) | ❌ | No attach-to-host op; bpmn-js needs `attach`. |
| Event definitions: timer / message / error / signal / escalation / conditional / compensation | ❌ | Events are created bare; can't set a definition. |

### B. Create — Activities
| Capability | State | Notes |
|---|---|---|
| Task (abstract) | ✅ | `task`. |
| User / Service task | ✅ | `userTask`,`serviceTask`. |
| Send / Receive / Script / Business-rule / Manual task | ❌ | Not in `NODE_TYPES`/`BPMN_TYPE`. |
| Call activity | ❌ | — |
| Sub-process (embedded / event / transaction) | ❌ | No container-creation + reparent op. |
| Activity markers (loop, multi-instance, compensation, ad-hoc) | ❌ | No marker property op. |

### C. Create — Gateways
| Capability | State | Notes |
|---|---|---|
| Exclusive / Parallel | ✅ | `exclusiveGateway`,`parallelGateway`. |
| Inclusive / Event-based / Complex | ❌ | Not creatable (only exclusive/parallel in `NODE_TYPES`). |

### D. Create — Data & Artifacts
| Capability | State | Notes |
|---|---|---|
| Data object / data store / data input-output | ❌ | Not modeled in the graph or ops. |
| Data association | ❌ | — |
| Text annotation / group | ❌ | — |
| Association (to artifact) | ❌ | — |

### E. Create — Swimlanes
| Capability | State | Notes |
|---|---|---|
| Pool / participant | ✅ | `addPool`. |
| Lane (in a pool) | ✅ | `addLane` (poolRef). |
| Nested lanes | ⚠️ | `addLane` adds at one level; no nested-lane targeting. |

### F. Connections
| Capability | State | Notes |
|---|---|---|
| Sequence flow | ✅ | `connect` flow=`sequence`. |
| Message flow (between pools) | ✅ | `connect` flow=`message`. |
| Conditional sequence flow (expression) | ❌ | `connect` has no condition expression. |
| Default flow (gateway) | ❌ | Can't mark a flow as default. |
| Reconnect flow source/target | ❌ | Only delete + recreate. |
| Association / data association | ❌ | — |

### G. Structural / reorganize
| Capability | State | Notes |
|---|---|---|
| Insert node into an existing flow (split edge, make space) | ✅ | Make-space insert + autoPlace (this session). |
| **Move/reassign an element to a different lane/pool** | ❌ | **The reported gap** — `updateElement` is name-only, so "move" plans are no-ops. |
| Reparent into / out of a sub-process | ❌ | — |
| Append after a node | ✅ | `autoPlace.append`. |
| Auto-layout / re-layout (pool-safe) | ⚠️ | Localized make-space only; no full reflow (bpmn-auto-layout is single-process, unsafe for pools). |

### H. Properties
| Capability | State | Notes |
|---|---|---|
| Rename (name) | ✅ | `updateElement.name`. |
| Documentation text | ❌ | — |
| User-task assignment (assignee / candidate groups) | ❌ | — |
| Gateway default flow | ❌ | (see F) |
| Flow condition expression | ❌ | (see F) |
| Loop / multi-instance config | ❌ | — |
| Bind element ↔ Asset Catalog asset | ⚠️ | Exists as a separate canvas feature; not exposed to `proposeEdit`. |

### I. Delete
| Capability | State | Notes |
|---|---|---|
| Delete element (cascade connected flows) | ✅ | `deleteElement` → `removeElements` (bpmn-js cascades). |
| Delete a flow by id | ✅ | `deleteElement` on a flow id (used by insert-rewire). |

### J. "Expert" intelligence (grounding & soundness)
| Capability | State | Notes |
|---|---|---|
| Full-diagram grounding (nodes, flows, lanes, pools, message flows, ids) | ✅ | This session. |
| Inspector findings + bound assets in context | ✅ | Chat route. |
| Soundness-aware edits (insert gateway instead of implicit split/merge) | ⚠️ | Prompt rule only; not validated post-plan. |
| Provider-neutral structured output | ✅ | `generateText` + Zod (Gemini-safe). |
| Reject/declare unsupported operations (no misleading no-op plans) | ❌ | **Causes the reported "nothing changes."** |

---

## 2. Gap plan (phased)

Each phase adds: op(s) to `EditPlanSchema` + `applyEditPlan` handler(s) + grounding/prompt updates + a unit test. Ops stay a flat discriminated union (Gemini-safe via `generateText`).

### Phase 1 — Stop misleading plans + high-value moves (P0)
1. **Capability guard (immediate, no new op):** teach the planner the exact op set and that it must NOT emit no-op `updateElement`s for unsupported requests; instead return `ops: []` with a summary explaining the limitation. Kills the "proposed updates but nothing changes" class. *(Quick prompt change.)*
2. **`moveToLane` / `reassignContainer` op** `{ elementId, containerRef }`: move an existing element into a target lane/pool. Apply via bpmn-js (shift element into the lane's band / `modeling.moveElements` to the lane; reparent). Single-element reliable; "move all" warns it may need relayout.
3. **`reconnect` op** `{ flowId, newSourceRef?, newTargetRef? }`: re-point a flow without delete+recreate.

### Phase 2 — Complete the element palette (P0/P1)
4. **More activity types:** add `sendTask, receiveTask, scriptTask, businessRuleTask, manualTask, callActivity` to `NODE_TYPES` + `BPMN_TYPE`.
5. **More gateways:** `inclusiveGateway, eventBasedGateway, complexGateway`.
6. **Sub-process:** create embedded sub-process + allow `containerRef` to target it (reparent nodes into it).

### Phase 3 — Flow semantics (P1)
7. **Conditional flow + default flow:** extend `connect` with `condition?: string` and a `setDefaultFlow` capability (gateway default).
8. **Event definitions:** extend `addNode` with `eventDefinition?: timer|message|error|signal|escalation|conditional|compensation|terminate` (+ message/error/signal refs).
9. **Activity markers:** `loop|multiInstanceParallel|multiInstanceSequential|compensation` on activities.

### Phase 4 — Data, artifacts, properties (P2)
10. **Data objects / stores + data associations** — requires modeling them in `ProcessGraph` first.
11. **Text annotations / groups / associations.**
12. **Property ops:** `setDocumentation`, user-task assignment, `bindAsset` (surface the existing asset-binding to `proposeEdit`).

### Phase 5 — Layout & soundness (P1, cross-cutting)
13. **Pool-safe relayout** for large structural edits (custom lane-aware layout, since bpmn-auto-layout is single-process).
14. **Post-plan soundness validation:** run the logic-inspector on the proposed result and surface/auto-correct implicit split/merge before the user approves.

---

## 3. Build notes
- All new ops are additive to `EditPlanSchema` (discriminated union) — keep using `generateText`+Zod (no provider `anyOf`).
- Each new op needs: schema variant, `groupOps` display bucket (proposal card), `applyEditPlan` handler, grounding/prompt mention, and a unit test.
- Grounding must describe new structure (data objects, sub-processes) the same way lanes/pools were added, so the AI can *see* what it can edit.
- Capability guard (Phase 1.1) ships first regardless — it's the honest stopgap that prevents no-op plans while the rest lands.

## 4. Out of scope (for now)
- DMN decision tables, BPMN execution semantics (Zeebe/Flowable export), simulation — these are P5 platform items on the main roadmap, not editing capabilities.
