"use client";

import {
  useEffect,
  useMemo,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  BoxSelect,
  CircleDot,
  CircleStop,
  Diamond,
  Hand,
  Maximize2,
  Move,
  Pencil,
  Plus,
  Shuffle,
  Spline,
  Square,
  Trash2,
  Type,
} from "lucide-react";

interface ModelerServices {
  get(name: string): any;
}

export interface MenuState {
  x: number;
  y: number;
  elementId: string | null;
}

/** Map a bpmn-js context-pad entry id to a Lucide icon. */
function iconForEntry(id: string): ComponentType<{ className?: string }> {
  if (id.includes("delete")) return Trash2;
  if (id.includes("connect")) return Spline;
  if (id.includes("replace")) return Shuffle;
  if (id.includes("gateway")) return Diamond;
  if (id.includes("end-event")) return CircleStop;
  if (id.includes("intermediate")) return CircleDot;
  if (id.includes("text-annotation")) return Type;
  if (id.includes("task") || id.includes("append")) return Square;
  return Plus;
}

interface CanvasContextMenuProps {
  menu: MenuState;
  modeler: ModelerServices;
  onClose: () => void;
  onCreateMore: (x: number, y: number) => void;
}

/**
 * The action hub, grouped logically: OBJECT (the selected element's own actions,
 * pulled from bpmn-js's context-pad providers) and CANVAS / TOOLS (global).
 * Problems/findings live in the Inspector, not here.
 */
export function CanvasContextMenu({ menu, modeler, onClose, onCreateMore }: CanvasContextMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const element = menu.elementId ? modeler.get("elementRegistry").get(menu.elementId) : null;

  const padEntries = useMemo(() => {
    if (!element) return [];
    try {
      const entries = modeler.get("contextPad").getEntries(element) as Record<string, any>;
      return Object.entries(entries)
        .filter(([, e]) => e && e.action && typeof e.action.click === "function")
        .map(([id, e]) => ({
          id,
          title: (e.title as string) || id,
          run: e.action.click as (event: Event, el: unknown) => void,
        }));
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element]);

  function runPad(
    entry: { id: string; run: (event: Event, el: unknown) => void },
    event: ReactMouseEvent,
  ) {
    try {
      if (entry.id.includes("replace")) {
        modeler
          .get("popupMenu")
          .open(element, "bpmn-replace", { x: menu.x, y: menu.y }, { title: "Change element" });
      } else {
        entry.run(event.nativeEvent, element);
      }
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

  const left = Math.min(menu.x, window.innerWidth - 248);
  const top = Math.min(menu.y, window.innerHeight - 420);

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
        className="absolute z-50 max-h-[80vh] w-60 overflow-y-auto rounded-[10px] border border-hairline bg-panel/95 py-1 text-sm shadow-xl backdrop-blur"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        {element && (
          <>
            <GroupLabel>Object</GroupLabel>
            {padEntries.map((entry) => (
              <MenuItem
                key={entry.id}
                icon={iconForEntry(entry.id)}
                label={entry.title}
                onClick={(e) => runPad(entry, e)}
              />
            ))}
            <MenuItem icon={Pencil} label="Rename" onClick={rename} />
            <Separator />
          </>
        )}

        <GroupLabel>Canvas</GroupLabel>
        <MenuItem icon={Plus} label="Create element…" onClick={() => onCreateMore(menu.x, menu.y)} />
        <MenuItem icon={Maximize2} label="Fit to view" onClick={fitView} />

        <Separator />
        <GroupLabel>Tools</GroupLabel>
        <MenuItem icon={Hand} label="Hand (pan)" onClick={() => tool("handTool")} />
        <MenuItem icon={BoxSelect} label="Lasso select" onClick={() => tool("lassoTool")} />
        <MenuItem icon={Move} label="Space tool" onClick={() => tool("spaceTool")} />
        <MenuItem icon={Spline} label="Global connect" onClick={() => tool("globalConnect")} />
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-fg-subtle">{children}</p>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e)}
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
