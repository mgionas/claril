"use client";

import type { EditPlan } from "@claril/ai-advisor";

const VERB: Record<string, string> = {
  addPool: "Pool",
  addLane: "Lane",
  addNode: "Add",
  connect: "Connect",
  updateElement: "Rename",
  deleteElement: "Delete",
};

function describe(op: EditPlan["ops"][number]): string {
  switch (op.kind) {
    case "addPool":
      return `+ Pool "${op.name}"`;
    case "addLane":
      return `+ Lane "${op.name}"`;
    case "addNode":
      return `+ ${op.type}${op.name ? ` "${op.name}"` : ""}`;
    case "connect":
      return `→ ${op.flow} flow${op.label ? ` "${op.label}"` : ""}`;
    case "updateElement":
      return `✎ ${op.elementId}${op.name ? ` → "${op.name}"` : ""}`;
    case "deleteElement":
      return `✕ ${op.elementId}`;
    default:
      return VERB[(op as { kind: string }).kind] ?? "change";
  }
}

export function ChangePlanCard({
  plan,
  applied,
  onApply,
  onDiscard,
}: {
  plan: EditPlan;
  applied: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="rounded-[8px] border border-hairline bg-elevated/60 p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 font-medium text-accent">✦ {plan.summary}</p>
      {plan.ops.length === 0 ? (
        <p className="text-xs text-fg-subtle">No change proposed.</p>
      ) : (
        <ul className="mb-3 space-y-0.5 font-mono text-[11px] text-fg-muted">
          {plan.ops.map((op, i) => (
            <li key={i}>{describe(op)}</li>
          ))}
        </ul>
      )}
      {plan.ops.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={applied}
            onClick={onApply}
            className="rounded-[6px] bg-accent px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {applied ? "Applied" : "Apply"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-elevated"
          >
            {applied ? "Undo" : "Discard"}
          </button>
        </div>
      )}
    </div>
  );
}
