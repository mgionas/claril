"use client";

import type { ComponentType, PointerEvent } from "react";
import {
  BoxSelect,
  Circle,
  CircleStop,
  Diamond,
  Group,
  Hand,
  Move,
  Plus,
  Spline,
  Square,
  Table,
} from "lucide-react";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { classifyPointer } from "@/lib/touch/pointer";

/** Minimal structural view of the bpmn-js services we drive. */
interface ModelerServices {
  get(name: string): any;
}

interface CreateItem {
  type: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** Pools use the dedicated participant factory, not createShape({type}). */
  participant?: boolean;
}

const CREATE: CreateItem[] = [
  { type: "bpmn:StartEvent", label: "Start event", Icon: Circle },
  { type: "bpmn:Task", label: "Task", Icon: Square },
  { type: "bpmn:ExclusiveGateway", label: "Gateway", Icon: Diamond },
  { type: "bpmn:EndEvent", label: "End event", Icon: CircleStop },
  // Containers — common structural elements (different from flow nodes).
  { type: "bpmn:Participant", label: "Pool", Icon: Table, participant: true },
  { type: "bpmn:Group", label: "Group", Icon: Group },
];

const TOOLS = [
  { id: "handTool", label: "Hand tool — pan the canvas", Icon: Hand },
  { id: "lassoTool", label: "Lasso — select multiple elements", Icon: BoxSelect },
  { id: "spaceTool", label: "Space tool — add/remove space", Icon: Move },
  { id: "globalConnect", label: "Global connect", Icon: Spline },
] as const;

/**
 * Custom slim palette — the always-visible "menu". Create tools (drag-to-place
 * on fine pointers; tap-to-place on coarse pointers — see onActivate below),
 * hand/lasso/space/global-connect tools, and a "More…" button that opens the
 * grouped element picker. The default bpmn-js palette and context pad are
 * hidden; this + the right-click menu are the action surfaces.
 */
export function CanvasPalette({
  modeler,
  onMore,
}: {
  modeler: ModelerServices;
  onMore: (x: number, y: number) => void;
}) {
  const isCoarse = useCoarsePointer();

  function startCreate(event: PointerEvent, item: CreateItem) {
    try {
      const factory = modeler.get("elementFactory");
      const shape = item.participant
        ? factory.createParticipantShape()
        : factory.createShape({ type: item.type });
      modeler.get("create").start(event.nativeEvent, shape);
    } catch {
      /* modeler not ready / mid-teardown */
    }
  }

  // Coarse tap: arm the shape so the next canvas tap drops it there (dragging
  // doesn't work well with touch). bpmn-canvas.tsx listens for this and
  // performs the actual placement. No-op on fine pointers — they place via
  // the drag-start below instead.
  function onActivate(item: CreateItem) {
    if (!isCoarse) return;
    window.dispatchEvent(
      new CustomEvent("claril:arm-create", {
        detail: { factoryType: item.type, participant: item.participant },
      }),
    );
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
      {CREATE.map((item) => (
        <button
          key={item.label}
          type="button"
          title={`${isCoarse ? "Tap" : "Drag onto the canvas"}: ${item.label}`}
          // Fine pointers (mouse) start the existing drag; coarse pointers
          // (touch/pen) arm tap-to-place on click instead — see onActivate.
          onPointerDown={(e) => {
            if (classifyPointer(e.pointerType) === "mouse") startCreate(e, item);
          }}
          onClick={() => onActivate(item)}
          className="flex size-9 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent coarse:size-11"
        >
          <item.Icon className="size-4" />
        </button>
      ))}

      <div className="mx-auto my-0.5 h-px w-6 bg-hairline" />

      {TOOLS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          onClick={() => activateTool(id)}
          className="flex size-9 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent coarse:size-11"
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
        className="flex size-9 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent coarse:size-11"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
