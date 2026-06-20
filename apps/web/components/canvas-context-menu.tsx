"use client";

import { useEffect, type ComponentType } from "react";
import { BoxSelect, Hand, Maximize2, Move, Pencil, Plus, Spline } from "lucide-react";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import { applyQuickFix } from "@/lib/apply-fix";
import { cn } from "@/lib/utils";

interface ModelerServices {
  get(name: string): any;
}

export interface MenuState {
  x: number;
  y: number;
  elementId: string | null;
}

const severityDot: Record<Severity, string> = {
  error: "bg-error",
  warning: "bg-warning",
  info: "bg-info",
};

interface CanvasContextMenuProps {
  menu: MenuState;
  modeler: ModelerServices;
  findings: Finding[];
  onClose: () => void;
  onCreateMore: (x: number, y: number) => void;
}

/**
 * The single action hub. Right-click anywhere: create (grouped picker), tools,
 * rename, fit, and per-element executable fixes. The bpmn-js context pad still
 * handles per-element append/connect/delete on hover.
 */
export function CanvasContextMenu({
  menu,
  modeler,
  findings,
  onClose,
  onCreateMore,
}: CanvasContextMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const element = menu.elementId ? modeler.get("elementRegistry").get(menu.elementId) : null;

  function rename() {
    try {
      modeler.get("directEditing").activate(element);
    } catch {
      /* ignore */
    }
    onClose();
  }

  function fitView() {
    try {
      modeler.get("canvas").zoom("fit-viewport", "auto");
    } catch {
      /* ignore */
    }
    onClose();
  }

  function tool(service: string) {
    try {
      modeler.get(service).toggle();
    } catch {
      /* ignore */
    }
    onClose();
  }

  function fix(quickFix: QuickFix) {
    applyQuickFix(modeler, quickFix);
    onClose();
  }

  const elementFindings = menu.elementId
    ? findings.filter((f) => f.elementId === menu.elementId)
    : [];

  const left = Math.min(menu.x, window.innerWidth - 248);
  const top = Math.min(menu.y, window.innerHeight - 380);

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute z-50 w-60 overflow-hidden rounded-[10px] border border-hairline bg-panel/95 py-1 text-sm shadow-xl backdrop-blur"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem icon={Plus} label="Create element…" onClick={() => onCreateMore(menu.x, menu.y)} />
        {element && <MenuItem icon={Pencil} label="Rename" onClick={rename} />}

        <Separator />
        <p className="px-3 pb-1 pt-1 text-[10px] uppercase tracking-wide text-fg-subtle">Tools</p>
        <MenuItem icon={Hand} label="Hand (pan)" onClick={() => tool("handTool")} />
        <MenuItem icon={BoxSelect} label="Lasso select" onClick={() => tool("lassoTool")} />
        <MenuItem icon={Move} label="Space tool" onClick={() => tool("spaceTool")} />
        <MenuItem icon={Spline} label="Global connect" onClick={() => tool("globalConnect")} />

        <Separator />
        <MenuItem icon={Maximize2} label="Fit to view" onClick={fitView} />

        {elementFindings.length > 0 && (
          <>
            <Separator />
            <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">Findings</p>
            {elementFindings.map((f, i) => (
              <div key={`${f.ruleId}-${i}`} className="flex items-start gap-2 px-3 py-1.5">
                <span
                  className={cn("mt-1 size-1.5 shrink-0 rounded-full", severityDot[f.severity])}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug">{f.message}</p>
                  {f.quickFix && <p className="text-[10px] text-fg-subtle">{f.quickFix}</p>}
                </div>
                {f.fix && (
                  <button
                    type="button"
                    onClick={() => f.fix && fix(f.fix)}
                    className="shrink-0 rounded-[6px] border border-hairline px-2 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/10"
                  >
                    Fix
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-fg transition-colors hover:bg-elevated"
    >
      <Icon className="size-3.5 text-fg-muted" />
      {label}
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-hairline" />;
}
