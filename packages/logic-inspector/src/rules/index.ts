import {
  implicitGateway,
  implicitJoin,
  multipleStartEvents,
  unlabeledGateway,
} from "./best-practice";
import {
  danglingFlow,
  deadEnd,
  infiniteLoop,
  missingEndEvent,
  missingStartEvent,
  mixedGateway,
  unreachableNode,
} from "./structural";
import type { Rule } from "./types";

/** The default rule set, run in order. */
export const rules: Rule[] = [
  missingStartEvent,
  missingEndEvent,
  danglingFlow,
  unreachableNode,
  deadEnd,
  infiniteLoop,
  mixedGateway,
  implicitGateway,
  implicitJoin,
  unlabeledGateway,
  multipleStartEvents,
];

export type { Rule };
