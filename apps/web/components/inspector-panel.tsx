import type { Finding, Severity } from "@claril/shared";
import { cn } from "@/lib/utils";

const severityDot: Record<Severity, string> = {
  error: "bg-error",
  warning: "bg-warning",
  info: "bg-info",
};

interface InspectorPanelProps {
  findings: Finding[];
  onSelect?: (elementId: string) => void;
  aiBusy?: boolean;
  aiError?: string | null;
}

export function InspectorPanel({ findings, onSelect, aiBusy, aiError }: InspectorPanelProps) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const hasAdvice = findings.some((f) => f.source === "advisor");

  return (
    <aside className="absolute right-3 top-16 z-10 flex max-h-[70vh] w-80 flex-col rounded-[10px] border border-hairline bg-panel/80 backdrop-blur">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
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

      <div className="overflow-y-auto p-2">
        {aiBusy && (
          <p className="px-2 py-2 text-xs text-accent">✦ Asking the AI advisor…</p>
        )}
        {aiError && <p className="px-2 py-2 text-xs text-error">{aiError}</p>}

        {findings.length === 0 && !aiBusy ? (
          <p className="px-2 py-6 text-center text-sm text-fg-subtle">No issues found ✓</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {findings.map((finding, index) => {
              const clickable = Boolean(finding.elementId && onSelect);
              const isAdvice = finding.source === "advisor";
              return (
                <li key={`${finding.ruleId}-${finding.elementId ?? index}-${index}`}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => finding.elementId && onSelect?.(finding.elementId)}
                    className={cn(
                      "flex w-full gap-2 rounded-[6px] px-2 py-2 text-left transition-colors",
                      clickable ? "hover:bg-elevated" : "cursor-default",
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
    </aside>
  );
}
