"use client";

import { useEffect, type ComponentType } from "react";
import { Circle, Maximize2, Pencil, Plus, Square } from "lucide-react";
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
 * Right-click menu. Deliberately does NOT duplicate the bpmn-js context pad
 * (append / connect / delete / replace live there). It adds Claril-specific
 * value: rename, executable quick-fixes, the element's findings, and a couple
 * of canvas helpers on empty space.
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

  function createAtPoint(type: string) {
    try {
      const canvas = modeler.get("canvas");
      const viewbox = canvas.viewbox();
      const rect = canvas.getContainer().getBoundingClientRect();
      const x = viewbox.x + (menu.x - rect.left) / viewbox.scale;
      const y = viewbox.y + (menu.y - rect.top) / viewbox.scale;
      const shape = modeler.get("elementFactory").createShape({ type });
      modeler.get("modeling").createShape(shape, { x, y }, canvas.getRootElement());
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
  const top = Math.min(menu.y, window.innerHeight - 300);

  const hasElementSection = Boolean(element);
  const hasFindings = elementFindings.length > 0;

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
        {hasElementSection && <MenuItem icon={Pencil} label="Rename" onClick={rename} />}

        {!element && (
          <>
            <MenuItem
              icon={Circle}
              label="Add start event"
              onClick={() => createAtPoint("bpmn:StartEvent")}
            />
            <MenuItem icon={Square} label="Add task" onClick={() => createAtPoint("bpmn:Task")} />
            <MenuItem
              icon={Plus}
              label="More elements…"
              onClick={() => onCreateMore(menu.x, menu.y)}
            />
            <MenuItem icon={Maximize2} label="Fit to view" onClick={fitView} />
          </>
        )}

        {hasFindings && (
          <>
            {hasElementSection && <Separator />}
            <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">
              Findings
            </p>
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
