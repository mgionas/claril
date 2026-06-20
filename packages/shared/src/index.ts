/**
 * Shared types used across Claril packages.
 */

export type Severity = "error" | "warning" | "info";

/**
 * A declarative, framework-free remediation. The inspector emits these; the
 * editor (bpmn-js) knows how to execute them. Keeping them declarative means
 * the inspector stays pure and independent of any rendering library.
 */
export type QuickFix =
  | { kind: "removeElement"; elementId: string }
  | { kind: "appendEndEvent"; elementId: string }
  | { kind: "prependStartEvent"; elementId: string };

/**
 * A single result produced by the logic inspector (deterministic) or the
 * AI advisor. The shape is identical so both can render in the same panel
 * and be consumed by the same API surface.
 */
export interface Finding {
  /** Stable rule identifier, e.g. "structural/unreachable-node". */
  ruleId: string;
  severity: Severity;
  /** Human-readable description of the issue. */
  message: string;
  /** The id of the diagram element the finding refers to, if any. */
  elementId?: string;
  /** Optional short hint describing how to fix the issue. */
  quickFix?: string;
  /** Optional one-click, executable remediation. */
  fix?: QuickFix;
  /** Where the finding came from. Defaults to deterministic inspector. */
  source?: "inspector" | "advisor";
}
