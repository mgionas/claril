"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import { cn } from "@/lib/utils";

const severityDot: Record<Severity, string> = { error: "bg-error", warning: "bg-warning", info: "bg-info" };

interface ProblemsTabProps {
  findings: Finding[];
  focusedElementId?: string;
  focusNonce?: number;
  aiConnected: boolean;
  aiBusy?: boolean;
  onSelect?: (elementId: string) => void;
  onApplyFix?: (fix: QuickFix) => void;
  /** Send this finding to the AI chat (and switch to the Chat tab). */
  onAskAi?: (finding: Finding) => void;
}

export function ProblemsTab({
  findings, focusedElementId, focusNonce, aiConnected, aiBusy, onSelect, onApplyFix, onAskAi,
}: ProblemsTabProps) {
  const firstFocusedIndex = focusedElementId
    ? findings.findIndex((f) => f.elementId === focusedElementId)
    : -1;
  const focusedRowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (focusedElementId) focusedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedElementId, focusNonce]);

  if (findings.length === 0 && !aiBusy) {
    return <p className="px-2 py-6 text-center text-sm text-fg-subtle">No issues found ✓</p>;
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {findings.map((finding, index) => {
        const clickable = Boolean(finding.elementId && onSelect);
        const isAdvice = finding.source === "advisor";
        const focused = Boolean(finding.elementId && finding.elementId === focusedElementId);
        return (
          <li
            key={`${finding.ruleId}-${finding.elementId ?? index}-${index}`}
            ref={index === firstFocusedIndex ? focusedRowRef : undefined}
            className={cn(
              "rounded-[6px] transition-colors",
              focused ? "bg-accent/10 ring-1 ring-inset ring-accent/40" : "hover:bg-elevated",
            )}
          >
            <div className="flex items-start gap-1">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => finding.elementId && onSelect?.(finding.elementId)}
                className={cn("flex flex-1 gap-2 px-2 py-2 text-left", clickable ? "cursor-pointer" : "cursor-default")}
              >
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", severityDot[finding.severity])} />
                <div className="min-w-0">
                  <p className="text-sm leading-snug">{finding.message}</p>
                  {finding.quickFix && <p className="mt-0.5 text-xs text-fg-subtle">{finding.quickFix}</p>}
                  <p className={cn("mt-1 font-mono text-[10px]", isAdvice ? "text-accent" : "text-fg-subtle")}>
                    {isAdvice ? "✦ AI advisor" : finding.ruleId}
                  </p>
                </div>
              </button>
            </div>
            <div className="flex gap-1 px-2 pb-2">
              {finding.fix && onApplyFix && (
                <button
                  type="button"
                  onClick={() => onApplyFix(finding.fix as QuickFix)}
                  className="rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/10"
                >
                  Fix
                </button>
              )}
              {aiConnected && onAskAi && (
                <button
                  type="button"
                  onClick={() => onAskAi(finding)}
                  className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
                >
                  <Sparkles className="size-3" /> Ask AI
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
