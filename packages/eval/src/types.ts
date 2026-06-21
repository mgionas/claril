import type { EditPlan } from "@claril/ai-advisor";
import type { ProcessGraph } from "@claril/logic-inspector";
import type { Finding } from "@claril/shared";

/** Inputs an assertion can inspect about a scored case. */
export interface AssertContext {
  plan: EditPlan;
  baseGraph: ProcessGraph;
  resultGraph: ProcessGraph;
  baselineFindings: Finding[];
  resultFindings: Finding[];
}

export interface EvalCase {
  id: string;
  description: string;
  tags: string[];
  baseBpmn: string;
  instruction: string;
  /** Per-case expectations; return [] when satisfied, else failure messages. */
  assert?: (ctx: AssertContext) => string[];
}

export interface CaseScore {
  validity: boolean;
  scope: boolean;
  soundness: boolean;
  assertions: boolean;
  applyOk: boolean;
  pass: boolean;
  opCount: number;
  /** Human-readable failures per dimension (for the report). */
  problems: string[];
}

export interface CaseResult extends CaseScore {
  id: string;
  tags: string[];
  tokens: number;
  error?: string;
}
