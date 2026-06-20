"use client";

import { Plus, ArrowRight, Pencil, Trash2, Check, RotateCcw, MessageCirclePlus } from "lucide-react";
import type { EditPlan, Op } from "@claril/ai-advisor";

export interface OpGroups {
  added: string[];
  connected: string[];
  updated: string[];
  removed: string[];
}

export function groupOps(ops: Op[]): OpGroups {
  const g: OpGroups = { added: [], connected: [], updated: [], removed: [] };
  for (const op of ops) {
    switch (op.kind) {
      case "addPool": g.added.push(`Pool "${op.name}"`); break;
      case "addLane": g.added.push(`Lane "${op.name}"`); break;
      case "addNode": g.added.push(`${op.type}${op.name ? ` "${op.name}"` : ""}`); break;
      case "connect": g.connected.push(`${op.flow} flow${op.label ? ` "${op.label}"` : ""}`); break;
      case "updateElement": g.updated.push(`${op.elementId}${op.name ? ` → "${op.name}"` : ""}`); break;
      case "deleteElement": g.removed.push(op.elementId); break;
    }
  }
  return g;
}

const SECTIONS = [
  { key: "added", icon: Plus, label: "Add", tone: "text-success" },
  { key: "connected", icon: ArrowRight, label: "Connect", tone: "text-info" },
  { key: "updated", icon: Pencil, label: "Update", tone: "text-warning" },
  { key: "removed", icon: Trash2, label: "Remove", tone: "text-error" },
] as const;

export function ProposalCard({
  plan,
  pending,
  busy,
  onApply,
  onDiscard,
  onKeepRefining,
}: {
  plan: EditPlan;
  pending: boolean;
  busy?: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onKeepRefining: () => void;
}) {
  const groups = groupOps(plan.ops);
  const empty = plan.ops.length === 0;

  return (
    <div className="rounded-[10px] border border-hairline bg-elevated/60 p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 font-medium text-accent">✦ {plan.summary}</p>
      {empty ? (
        <p className="text-xs text-fg-subtle">No changes proposed.</p>
      ) : (
        <div className="mb-3 space-y-1.5">
          {SECTIONS.map(({ key, icon: Icon, label, tone }) => {
            const items = groups[key];
            if (items.length === 0) return null;
            return (
              <div key={key} className="flex gap-2">
                <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
                  <ul className="flex flex-wrap gap-1">
                    {items.map((t, i) => (
                      <li key={i} className="rounded-[5px] bg-canvas px-1.5 py-0.5 text-[11px] text-fg-muted">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!empty && (
        pending ? (
          <div className="space-y-2">
            <p className="text-[11px] text-fg-subtle">Applied to canvas — review:</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onApply}
                className="flex items-center gap-1 rounded-[6px] bg-accent px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
              >
                <Check className="size-3.5" />
                Approve
              </button>
              <button
                type="button"
                onClick={onDiscard}
                className="flex items-center gap-1 rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-elevated"
              >
                <RotateCcw className="size-3.5" />
                Roll back
              </button>
              <button
                type="button"
                onClick={onKeepRefining}
                className="flex items-center gap-1 rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-fg-muted transition-colors hover:bg-elevated"
              >
                <MessageCirclePlus className="size-3.5" />
                Keep refining
              </button>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-fg-subtle">
            <Check className="size-3" />
            Applied
          </p>
        )
      )}
    </div>
  );
}
