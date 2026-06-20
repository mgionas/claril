import { z } from "zod";
import type { ProcessGraph } from "@claril/logic-inspector";

/** Node types the planner may create (kept aligned with bpmn-js create types). */
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
  "subProcess",
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
  eventDefinition: z
    .enum(["timer", "message", "error", "signal", "escalation", "conditional", "compensation", "terminate"])
    .optional(),
  marker: z
    .enum(["loop", "multiInstanceParallel", "multiInstanceSequential", "compensation"])
    .optional(),
});
const AddArtifact = z.object({
  kind: z.literal("addArtifact"),
  tempId: z.string(),
  artifact: z.enum(["dataObject", "dataStore", "textAnnotation"]),
  name: z.string().optional(),
  text: z.string().optional(),
});
const Associate = z.object({
  kind: z.literal("associate"),
  fromRef: z.string(),
  toRef: z.string(),
});
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
const SetFlow = z.object({
  kind: z.literal("setFlow"),
  flowId: z.string(),
  condition: z.string().optional(),
  isDefault: z.boolean().optional(),
});
const SetMarker = z.object({
  kind: z.literal("setMarker"),
  elementId: z.string(),
  marker: z.enum(["loop", "multiInstanceParallel", "multiInstanceSequential", "compensation", "none"]),
});
const UpdateElement = z.object({
  kind: z.literal("updateElement"),
  elementId: z.string(),
  name: z.string().optional(),
});
const SetDocumentation = z.object({
  kind: z.literal("setDocumentation"),
  elementId: z.string(),
  text: z.string(),
});
const MoveToContainer = z.object({
  kind: z.literal("moveToContainer"),
  /** id of the existing element to move. */
  elementId: z.string(),
  /** Target lane/pool — a tempId from this plan or an existing lane/pool id. */
  containerRef: z.string(),
});
const Reconnect = z.object({
  kind: z.literal("reconnect"),
  /** id of an existing sequence/message flow. */
  flowId: z.string(),
  newSourceRef: z.string().optional(),
  newTargetRef: z.string().optional(),
});
const DeleteElement = z.object({ kind: z.literal("deleteElement"), elementId: z.string() });

export const OpSchema = z.discriminatedUnion("kind", [
  AddPool,
  AddLane,
  AddNode,
  AddArtifact,
  Connect,
  Associate,
  SetFlow,
  MoveToContainer,
  Reconnect,
  SetMarker,
  UpdateElement,
  SetDocumentation,
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
  addArtifact: 3,
  connect: 4,
  associate: 5,
  setFlow: 6,
  moveToContainer: 7,
  reconnect: 8,
  setMarker: 9,
  updateElement: 10,
  setDocumentation: 11,
  deleteElement: 12,
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
    if (
      op.kind === "addPool" ||
      op.kind === "addLane" ||
      op.kind === "addNode" ||
      op.kind === "addArtifact"
    ) {
      defined.add(op.tempId);
    }
  }
  return { defined };
}

/**
 * Deterministically validate a plan against the current graph BEFORE it is
 * applied, catching the classes of bad plans LLMs produce:
 *  - references to ids that don't exist (and aren't tempIds defined in the plan)
 *    → ops that would silently no-op,
 *  - newly-added flow nodes that are never connected → floating/orphan nodes.
 * Returns a list of human-readable problems (empty = valid). Used to drive a
 * single self-repair retry of the planner.
 */
export function validateEditPlan(plan: EditPlan, graph: ProcessGraph): string[] {
  const errors: string[] = [];

  const tempIds = new Set<string>();
  for (const op of plan.ops) {
    if (
      op.kind === "addPool" ||
      op.kind === "addLane" ||
      op.kind === "addNode" ||
      op.kind === "addArtifact"
    )
      tempIds.add(op.tempId);
  }

  const existing = new Set<string>([
    ...graph.nodes.map((n) => n.id),
    ...(graph.flows ?? []).map((f) => f.id),
    ...(graph.lanes ?? []).map((l) => l.id),
    ...(graph.pools ?? []).map((p) => p.id),
  ]);
  const containerNames = new Set<string>(
    [
      ...(graph.lanes ?? []).map((l) => l.name),
      ...(graph.pools ?? []).map((p) => p.name),
    ]
      .filter((n): n is string => Boolean(n))
      .map((n) => n.toLowerCase()),
  );

  const known = (ref: string) => tempIds.has(ref) || existing.has(ref);
  const knownContainer = (ref: string) => known(ref) || containerNames.has(ref.trim().toLowerCase());
  const ref = (label: string, value: string, ok: boolean) => {
    if (!ok) errors.push(`${label} "${value}" does not match any existing element or a tempId in this plan`);
  };

  const connectedTemps = new Set<string>();
  for (const op of plan.ops) {
    switch (op.kind) {
      case "connect":
        ref("connect.fromRef", op.fromRef, known(op.fromRef));
        ref("connect.toRef", op.toRef, known(op.toRef));
        connectedTemps.add(op.fromRef);
        connectedTemps.add(op.toRef);
        break;
      case "associate":
        ref("associate.fromRef", op.fromRef, known(op.fromRef));
        ref("associate.toRef", op.toRef, known(op.toRef));
        break;
      case "addLane":
        ref("addLane.poolRef", op.poolRef, knownContainer(op.poolRef));
        break;
      case "addNode":
        if (op.containerRef) ref("addNode.containerRef", op.containerRef, knownContainer(op.containerRef));
        break;
      case "moveToContainer":
        ref("moveToContainer.elementId", op.elementId, known(op.elementId));
        ref("moveToContainer.containerRef", op.containerRef, knownContainer(op.containerRef));
        break;
      case "reconnect":
        ref("reconnect.flowId", op.flowId, known(op.flowId));
        if (op.newSourceRef) ref("reconnect.newSourceRef", op.newSourceRef, known(op.newSourceRef));
        if (op.newTargetRef) ref("reconnect.newTargetRef", op.newTargetRef, known(op.newTargetRef));
        break;
      case "setFlow":
        ref("setFlow.flowId", op.flowId, known(op.flowId));
        break;
      case "setMarker":
        ref("setMarker.elementId", op.elementId, known(op.elementId));
        break;
      case "updateElement":
        ref("updateElement.elementId", op.elementId, known(op.elementId));
        break;
      case "setDocumentation":
        ref("setDocumentation.elementId", op.elementId, known(op.elementId));
        break;
      case "deleteElement":
        ref("deleteElement.elementId", op.elementId, known(op.elementId));
        break;
    }
  }

  // Orphan check: every newly-added FLOW node must be wired into the flow.
  for (const op of plan.ops) {
    if (op.kind === "addNode" && !connectedTemps.has(op.tempId)) {
      errors.push(
        `added node "${op.name ?? op.tempId}" is not connected to anything — add connect ops wiring it into the flow`,
      );
    }
  }

  return errors;
}
