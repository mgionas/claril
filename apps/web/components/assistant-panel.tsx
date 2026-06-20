"use client";

import { useState } from "react";
import { Send, Sparkles, FileText, Wand2 } from "lucide-react";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import type { EditPlan } from "@claril/ai-advisor";
import { ChangePlanCard } from "@/components/change-plan-card";
import { cn } from "@/lib/utils";

const dot: Record<Severity, string> = { error: "bg-error", warning: "bg-warning", info: "bg-info" };

export interface AssistantPanelProps {
  open: boolean;
  findings: Finding[];
  aiBusy: boolean;
  aiError: string | null;
  /** Last AI summary line (critique/Q&A), shown above the plan card. */
  message: string | null;
  plan: EditPlan | null;
  planApplied: boolean;
  onSelect?: (elementId: string) => void;
  onApplyFix?: (fix: QuickFix) => void;
  onInstruct: (text: string) => void;
  onAskAi: () => void;
  onGenerateDocs: () => void;
  onApplyPlan: () => void;
  onDiscardPlan: () => void;
}

export function AssistantPanel(props: AssistantPanelProps) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (t) {
      props.onInstruct(t);
      setText("");
    }
  };

  return (
    <aside
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        props.open ? "w-80" : "w-0",
      )}
    >
      <div className="flex h-full w-80 flex-col border-l border-hairline bg-panel/90 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <Sparkles className="size-4 text-accent" />
          <span className="text-sm font-medium">Assistant</span>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {props.findings.map((f, i) => (
            <button
              key={`${f.ruleId}-${i}`}
              type="button"
              disabled={!f.elementId}
              onClick={() => f.elementId && props.onSelect?.(f.elementId)}
              className="flex w-full gap-2 rounded-[6px] px-2 py-2 text-left hover:bg-elevated"
            >
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dot[f.severity])} />
              <span className="text-sm leading-snug">{f.message}</span>
            </button>
          ))}

          {props.aiBusy && <p className="px-2 text-xs text-accent">✦ Thinking…</p>}
          {props.aiError && <p className="px-2 text-xs text-error">{props.aiError}</p>}
          {props.message && (
            <p className="whitespace-pre-wrap px-2 text-sm leading-relaxed text-fg">{props.message}</p>
          )}
          {props.plan && (
            <ChangePlanCard
              plan={props.plan}
              applied={props.planApplied}
              onApply={props.onApplyPlan}
              onDiscard={props.onDiscardPlan}
            />
          )}
        </div>

        <div className="border-t border-hairline p-2">
          <div className="mb-2 flex flex-wrap gap-1">
            <Chip icon={Wand2} label="Review" onClick={props.onAskAi} />
            <Chip icon={FileText} label="Document" onClick={props.onGenerateDocs} />
          </div>
          <div className="flex items-end gap-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Describe a change… e.g. add an end event after Review"
              className="min-h-0 flex-1 resize-none rounded-[6px] border border-hairline bg-canvas px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={props.aiBusy}
              className="flex size-8 items-center justify-center rounded-[6px] bg-accent text-white hover:bg-accent/90 disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Chip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}
