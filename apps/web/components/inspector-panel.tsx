"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import { cn } from "@/lib/utils";

const severityDot: Record<Severity, string> = {
  error: "bg-error",
  warning: "bg-warning",
  info: "bg-info",
};

interface InspectorPanelProps {
  findings: Finding[];
  onSelect?: (elementId: string) => void;
  onApplyFix?: (fix: QuickFix) => void;
  aiBusy?: boolean;
  aiError?: string | null;
}

export function InspectorPanel({
  findings,
  onSelect,
  onApplyFix,
  aiBusy,
  aiError,
}: InspectorPanelProps) {
  // Minimized by default — slides out from the right edge on demand (or when
  // the AI is working).
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (aiBusy || aiError) setOpen(true);
  }, [aiBusy, aiError]);

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const hasAdvice = findings.some((f) => f.source === "advisor");

  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-20 w-80 transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Peek tab — always visible on the right edge; toggles the drawer. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Collapse Inspector" : "Open Inspector"}
        className="absolute -left-9 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-[10px] border border-r-0 border-hairline bg-panel/80 px-1.5 py-3 backdrop-blur transition-colors hover:bg-elevated"
      >
        <ChevronLeft
          className={cn("size-4 text-fg-muted transition-transform", open && "rotate-180")}
        />
        {!open && (errors > 0 || warnings > 0) && (
          <span className="flex flex-col items-center gap-1 text-[10px] text-fg-muted">
            {errors > 0 && (
              <span className="flex items-center gap-0.5">
                <span className="size-1.5 rounded-full bg-error" />
                {errors}
              </span>
            )}
            {warnings > 0 && (
              <span className="flex items-center gap-0.5">
                <span className="size-1.5 rounded-full bg-warning" />
                {warnings}
              </span>
            )}
          </span>
        )}
      </button>

      {/* Full-height drawer body. */}
      <div className="flex h-full w-80 flex-col border-l border-hairline bg-panel/90 backdrop-blur">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <span className="text-sm font-medium">Inspector</span>
          <div className="flex items-center gap-3 text-xs text-fg-muted">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-error" />
              {errors}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-warning" />
              {warnings}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {aiBusy && <p className="px-2 py-2 text-xs text-accent">✦ Asking the AI advisor…</p>}
          {aiError && <p className="px-2 py-2 text-xs text-error">{aiError}</p>}

          {findings.length === 0 && !aiBusy ? (
            <p className="px-2 py-6 text-center text-sm text-fg-subtle">No issues found ✓</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {findings.map((finding, index) => {
                const clickable = Boolean(finding.elementId && onSelect);
                const isAdvice = finding.source === "advisor";
                return (
                  <li
                    key={`${finding.ruleId}-${finding.elementId ?? index}-${index}`}
                    className="flex items-start gap-1 rounded-[6px] hover:bg-elevated"
                  >
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => finding.elementId && onSelect?.(finding.elementId)}
                      className={cn(
                        "flex flex-1 gap-2 px-2 py-2 text-left",
                        clickable ? "cursor-pointer" : "cursor-default",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          severityDot[finding.severity],
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{finding.message}</p>
                        {finding.quickFix && (
                          <p className="mt-0.5 text-xs text-fg-subtle">{finding.quickFix}</p>
                        )}
                        <p
                          className={cn(
                            "mt-1 font-mono text-[10px]",
                            isAdvice ? "text-accent" : "text-fg-subtle",
                          )}
                        >
                          {isAdvice ? "✦ AI advisor" : finding.ruleId}
                        </p>
                      </div>
                    </button>
                    {finding.fix && onApplyFix && (
                      <button
                        type="button"
                        onClick={() => onApplyFix(finding.fix as QuickFix)}
                        title="Apply this fix"
                        className="mr-1 mt-1.5 shrink-0 rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/10"
                      >
                        Fix
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {hasAdvice && (
            <p className="px-2 pt-2 text-[10px] text-fg-subtle">
              AI advice is suggestive — verify before acting.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
