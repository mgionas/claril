import { z } from "zod";

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
  Connect,
  MoveToContainer,
  Reconnect,
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
  moveToContainer: 4,
  reconnect: 5,
  updateElement: 6,
  deleteElement: 7,
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
