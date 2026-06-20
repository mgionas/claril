"use client";

import type { MouseEvent } from "react";
import {
  BoxSelect,
  Circle,
  CircleStop,
  Diamond,
  Hand,
  Move,
  Plus,
  Spline,
  Square,
} from "lucide-react";

/** Minimal structural view of the bpmn-js services we drive. */
interface ModelerServices {
  get(name: string): any;
}

const CREATE = [
  { type: "bpmn:StartEvent", label: "Start event", Icon: Circle },
  { type: "bpmn:Task", label: "Task", Icon: Square },
  { type: "bpmn:ExclusiveGateway", label: "Gateway", Icon: Diamond },
  { type: "bpmn:EndEvent", label: "End event", Icon: CircleStop },
] as const;

const TOOLS = [
  { id: "handTool", label: "Hand tool — pan the canvas", Icon: Hand },
  { id: "lassoTool", label: "Lasso — select multiple elements", Icon: BoxSelect },
  { id: "spaceTool", label: "Space tool — add/remove space", Icon: Move },
  { id: "globalConnect", label: "Global connect", Icon: Spline },
] as const;

/**
 * Custom slim palette — the always-visible "menu". Create tools (drag-to-place),
 * hand/lasso/space/global-connect tools, and a "More…" button that opens the
 * grouped element picker. The default bpmn-js palette and context pad are hidden;
 * this + the right-click menu are the action surfaces.
 */
export function CanvasPalette({
  modeler,
  onMore,
}: {
  modeler: ModelerServices;
  onMore: (x: number, y: number) => void;
}) {
  function startCreate(event: MouseEvent, type: string) {
    try {
      const shape = modeler.get("elementFactory").createShape({ type });
      modeler.get("create").start(event.nativeEvent, shape);
    } catch {
      /* modeler not ready / mid-teardown */
    }
  }

  function activateTool(service: string) {
    try {
      modeler.get(service).toggle();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pointer-events-auto absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-[10px] border border-hairline bg-panel/80 p-1 backdrop-blur">
      {CREATE.map(({ type, label, Icon }) => (
        <button
          key={type}
          type="button"
          title={`Drag onto the canvas: ${label}`}
          onMouseDown={(e) => startCreate(e, type)}
          className="flex size-9 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
        >
          <Icon className="size-4" />
        </button>
      ))}

      <div className="mx-auto my-0.5 h-px w-6 bg-hairline" />

      {TOOLS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          onClick={() => activateTool(id)}
          className="flex size-9 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
        >
          <Icon className="size-4" />
        </button>
      ))}

      <div className="mx-auto my-0.5 h-px w-6 bg-hairline" />

      <button
        type="button"
        title="More elements…"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onMore(rect.right + 8, rect.top);
        }}
        className="flex size-9 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
