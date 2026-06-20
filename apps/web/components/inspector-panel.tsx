"use client";

import { useEffect, useRef } from "react";
import { MessageCircle, X } from "lucide-react";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import { cn } from "@/lib/utils";

const severityDot: Record<Severity, string> = {
  error: "bg-error",
  warning: "bg-warning",
  info: "bg-info",
};

interface InspectorPanelProps {
  open: boolean;
  findings: Finding[];
  /** Element whose finding should be highlighted + scrolled into view. */
  focusedElementId?: string;
  /** Bumped on each request so re-selecting the same element re-scrolls. */
  focusNonce?: number;
  onSelect?: (elementId: string) => void;
  onApplyFix?: (fix: QuickFix) => void;
  aiBusy?: boolean;
  aiError?: string | null;
  /** The last Q&A question asked, shown above the findings. */
  qaQuestion?: string | null;
  /** The grounded answer to {@link qaQuestion}, rendered as prose. */
  qaAnswer?: string | null;
  /** Dismiss the Q&A answer block. */
  onClearQa?: () => void;
}

/**
 * In-flow, full-height drawer. It takes layout width (animated), so opening it
 * shrinks the canvas region rather than overlaying it. Toggled from the
 * Workbench tab.
 */
export function InspectorPanel({
  open,
  findings,
  focusedElementId,
  focusNonce,
  onSelect,
  onApplyFix,
  aiBusy,
  aiError,
  qaQuestion,
  qaAnswer,
  onClearQa,
}: InspectorPanelProps) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const hasAdvice = findings.some((f) => f.source === "advisor");
  const firstFocusedIndex = focusedElementId
    ? findings.findIndex((f) => f.elementId === focusedElementId)
    : -1;
  const focusedRowRef = useRef<HTMLLIElement>(null);

  // When an element is selected (e.g. from the canvas "View problems" action),
  // scroll its finding into view inside the drawer.
  useEffect(() => {
    if (open && focusedElementId) {
      focusedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [open, focusedElementId, focusNonce]);

  return (
    <aside
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        open ? "w-80" : "w-0",
      )}
    >
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

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {aiBusy && <p className="px-2 py-2 text-xs text-accent">✦ Asking the AI advisor…</p>}
          {aiError && <p className="px-2 py-2 text-xs text-error">{aiError}</p>}

          {(qaQuestion || qaAnswer) && !aiBusy && (
            <div className="mx-1 mb-2 rounded-[8px] border border-hairline bg-elevated/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-start gap-1.5 text-xs text-fg-muted">
                  <MessageCircle className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  <span className="font-medium">{qaQuestion}</span>
                </p>
                {onClearQa && (
                  <button
                    type="button"
                    onClick={onClearQa}
                    title="Dismiss answer"
                    className="shrink-0 rounded-[4px] p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {qaAnswer && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg">
                  {qaAnswer}
                </p>
              )}
              <p className="mt-2 text-[10px] text-fg-subtle">✦ AI answer — verify before acting.</p>
            </div>
          )}

          {findings.length === 0 && !aiBusy ? (
            <p className="px-2 py-6 text-center text-sm text-fg-subtle">No issues found ✓</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {findings.map((finding, index) => {
                const clickable = Boolean(finding.elementId && onSelect);
                const isAdvice = finding.source === "advisor";
                const focused = Boolean(
                  finding.elementId && finding.elementId === focusedElementId,
                );
                return (
                  <li
                    key={`${finding.ruleId}-${finding.elementId ?? index}-${index}`}
                    ref={index === firstFocusedIndex ? focusedRowRef : undefined}
                    className={cn(
                      "flex items-start gap-1 rounded-[6px] transition-colors",
                      focused
                        ? "bg-accent/10 ring-1 ring-inset ring-accent/40"
                        : "hover:bg-elevated",
                    )}
                  >
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => finding.elementId && onSelect?.(finding.elementId)}
                      title={clickable ? "Show on canvas" : undefined}
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
