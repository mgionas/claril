"use client";

import { useEffect, type ComponentType } from "react";
import {
  Circle,
  CircleStop,
  Diamond,
  Pencil,
  Square,
  Trash2,
} from "lucide-react";
import type { Finding, Severity } from "@claril/shared";
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
}

export function CanvasContextMenu({ menu, modeler, findings, onClose }: CanvasContextMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const element = menu.elementId ? modeler.get("elementRegistry").get(menu.elementId) : null;
  const isConnection = Boolean(element && Array.isArray(element.waypoints));
  const isShape = Boolean(element) && !isConnection;

  function append(type: string) {
    try {
      const shape = modeler.get("elementFactory").createShape({ type });
      modeler.get("autoPlace").append(element, shape);
    } catch {
      /* ignore */
    }
    onClose();
  }

  function rename() {
    try {
      modeler.get("directEditing").activate(element);
    } catch {
      /* ignore */
    }
    onClose();
  }

  function remove() {
    try {
      modeler.get("modeling").removeElements([element]);
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

  const elementFindings = menu.elementId
    ? findings.filter((f) => f.elementId === menu.elementId)
    : [];

  const left = Math.min(menu.x, window.innerWidth - 240);
  const top = Math.min(menu.y, window.innerHeight - 280);

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
        className="absolute z-50 w-56 overflow-hidden rounded-[10px] border border-hairline bg-panel/95 py-1 text-sm shadow-xl backdrop-blur"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        {isShape && (
          <>
            <MenuItem icon={Square} label="Append task" onClick={() => append("bpmn:Task")} />
            <MenuItem
              icon={Diamond}
              label="Append gateway"
              onClick={() => append("bpmn:ExclusiveGateway")}
            />
            <MenuItem
              icon={CircleStop}
              label="Append end event"
              onClick={() => append("bpmn:EndEvent")}
            />
            <Separator />
            <MenuItem icon={Pencil} label="Rename" onClick={rename} />
            <MenuItem icon={Trash2} label="Delete" onClick={remove} danger />
          </>
        )}

        {isConnection && <MenuItem icon={Trash2} label="Delete" onClick={remove} danger />}

        {!element && (
          <>
            <MenuItem
              icon={Circle}
              label="Add start event"
              onClick={() => createAtPoint("bpmn:StartEvent")}
            />
            <MenuItem icon={Square} label="Add task" onClick={() => createAtPoint("bpmn:Task")} />
          </>
        )}

        {elementFindings.length > 0 && (
          <>
            <Separator />
            <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">
              Findings
            </p>
            {elementFindings.map((f, i) => (
              <div key={`${f.ruleId}-${i}`} className="flex gap-2 px-3 py-1.5">
                <span
                  className={cn("mt-1 size-1.5 shrink-0 rounded-full", severityDot[f.severity])}
                />
                <div className="min-w-0">
                  <p className="text-xs leading-snug">{f.message}</p>
                  {f.quickFix && <p className="text-[10px] text-fg-subtle">{f.quickFix}</p>}
                </div>
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
  danger,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-elevated",
        danger ? "text-error" : "text-fg",
      )}
    >
      <Icon className="size-3.5 text-fg-muted" />
      {label}
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-hairline" />;
}
