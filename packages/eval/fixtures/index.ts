import type { EvalCase } from "../src/types";
import { addStepCases } from "./add-step";
import { conditionalBranchCases } from "./conditional-branch";
import { documentCases } from "./document";
import { insertIntoFlowCases } from "./insert-into-flow";
import { moveToLaneCases } from "./move-to-lane";
import { noUnrequestedDeleteCases } from "./no-unrequested-delete";
import { unsupportedCases } from "./unsupported";

/** The full editing-eval corpus, one or more cases per glitch class. */
export const cases: EvalCase[] = [
  ...addStepCases,
  ...moveToLaneCases,
  ...insertIntoFlowCases,
  ...conditionalBranchCases,
  ...documentCases,
  ...unsupportedCases,
  ...noUnrequestedDeleteCases,
];
