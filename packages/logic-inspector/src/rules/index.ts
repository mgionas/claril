import { implicitGateway } from "./best-practice";
import {
  danglingFlow,
  deadEnd,
  missingEndEvent,
  missingStartEvent,
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
  implicitGateway,
];

export type { Rule };
