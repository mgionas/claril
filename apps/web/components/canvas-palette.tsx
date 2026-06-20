"use client";

import type { MouseEvent } from "react";
import {
  BoxSelect,
  Circle,
  CircleStop,
  Diamond,
  Hand,
  Move,
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
  { id: "hand", label: "Hand tool — pan the canvas", Icon: Hand },
  { id: "lasso", label: "Lasso — select multiple elements", Icon: BoxSelect },
  { id: "space", label: "Space tool — add/remove space", Icon: Move },
  { id: "connect", label: "Global connect", Icon: Spline },
] as const;

/**
 * Custom slim palette. Replaces bpmn-js's default left toolbar but keeps full
 * capability parity: the four common create tools (drag-to-place) plus the
 * hand / lasso / space / global-connect tools. Element-type variety beyond the
 * four is reached via the context pad's append + replace (morph) menu, so this
 * stays slim without losing features.
 */
export function CanvasPalette({ modeler }: { modeler: ModelerServices }) {
  function startCreate(event: MouseEvent, type: string) {
    try {
      const shape = modeler.get("elementFactory").createShape({ type });
      modeler.get("create").start(event.nativeEvent, shape);
    } catch {
      /* modeler not ready / mid-teardown */
    }
  }

  function activateTool(event: MouseEvent, id: string) {
    const native = event.nativeEvent;
    try {
      if (id === "hand") modeler.get("handTool").activateHand(native);
      else if (id === "lasso") modeler.get("lassoTool").activateSelection(native);
      else if (id === "space") modeler.get("spaceTool").activateSelection(native);
      else if (id === "connect") modeler.get("globalConnect").start(native);
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
          onClick={(e) => activateTool(e, id)}
          className="flex size-9 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
