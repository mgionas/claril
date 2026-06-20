"use client";

import type { MouseEvent } from "react";
import { Circle, CircleStop, Diamond, Square } from "lucide-react";

/** Minimal structural view of the bpmn-js services we drive. */
interface ModelerServices {
  get(name: string): any;
}

const TOOLS = [
  { type: "bpmn:StartEvent", label: "Start event", Icon: Circle },
  { type: "bpmn:Task", label: "Task", Icon: Square },
  { type: "bpmn:ExclusiveGateway", label: "Gateway", Icon: Diamond },
  { type: "bpmn:EndEvent", label: "End event", Icon: CircleStop },
] as const;

/**
 * Custom slim palette. Replaces bpmn-js's default left toolbar — each button
 * starts a drag-to-place via bpmn-js's `create` service, so elements still
 * snap and connect natively. Day-to-day modeling is meant to flow through the
 * context pad (append next element from a selected one); this is just for
 * creating from an empty canvas.
 */
export function CanvasPalette({ modeler }: { modeler: ModelerServices }) {
  function startCreate(event: MouseEvent, type: string) {
    try {
      const elementFactory = modeler.get("elementFactory");
      const create = modeler.get("create");
      const shape = elementFactory.createShape({ type });
      create.start(event.nativeEvent, shape);
    } catch {
      // Modeler not ready / mid-teardown — ignore.
    }
  }

  return (
    <div className="pointer-events-auto absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-[10px] border border-hairline bg-panel/80 p-1 backdrop-blur">
      {TOOLS.map(({ type, label, Icon }) => (
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
    </div>
  );
}
