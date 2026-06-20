"use client";

import {
  useEffect,
  useMemo,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  Boxes,
  BoxSelect,
  CircleDot,
  CircleStop,
  Diamond,
  Hand,
  Info,
  Maximize2,
  Move,
  Pencil,
  Plus,
  Shuffle,
  Spline,
  Square,
  Trash2,
  Type,
  Unlink,
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

const severityRank: Record<Severity, number> = { error: 3, warning: 2, info: 1 };
const severityColor: Record<Severity, string> = {
  error: "text-error",
  warning: "text-warning",
  info: "text-info",
};

interface CanvasContextMenuProps {
  menu: MenuState;
  modeler: ModelerServices;
  findings: Finding[];
  onShowProblems: (elementId: string) => void;
  /** Name of the asset bound to the selected element, if any. */
  boundAssetName?: string;
  /** Open the asset picker to bind the selected element. */
  onBindAsset: (elementId: string) => void;
  /** Remove the binding from the selected element. */
  onUnbindAsset: (elementId: string) => void;
  onClose: () => void;
  onCreateMore: (x: number, y: number) => void;
}

/**
 * The action hub, grouped logically: OBJECT (the selected element's own actions,
 * pulled from bpmn-js's context-pad providers) and CANVAS / TOOLS (global).
 * The full problem list lives in the Inspector; the OBJECT group surfaces a
 * shortcut that opens the drawer and selects this element's finding.
 */
export function CanvasContextMenu({
  menu,
  modeler,
  findings,
  onShowProblems,
  boundAssetName,
  onBindAsset,
  onUnbindAsset,
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

  // Findings attached to the selected element (drives the "View problems" entry).
  const elementFindings = useMemo(
    () => (menu.elementId ? findings.filter((f) => f.elementId === menu.elementId) : []),
    [findings, menu.elementId],
  );
  const worstSeverity = elementFindings.reduce<Severity | null>(
    (worst, f) => (!worst || severityRank[f.severity] > severityRank[worst] ? f.severity : worst),
    null,
  );

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

  // Clamp the menu inside the viewport. Open at the cursor, but never run off
  // the bottom: if the cursor is low, lift the menu so it keeps a usable
  // height, then cap its height to the remaining space (it scrolls within).
  const MARGIN = 8;
  const MENU_WIDTH = 240;
  const MIN_HEIGHT = 220;
  const left = Math.max(MARGIN, Math.min(menu.x, window.innerWidth - MENU_WIDTH - MARGIN));
  const top = Math.max(MARGIN, Math.min(menu.y, window.innerHeight - MARGIN - MIN_HEIGHT));
  const maxHeight = window.innerHeight - top - MARGIN;

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
        className="absolute z-50 w-60 overflow-y-auto overscroll-contain rounded-[10px] border border-hairline bg-panel/95 py-1 text-sm shadow-xl backdrop-blur"
        style={{ left, top, maxHeight }}
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
            {elementFindings.length > 0 && menu.elementId && (
              <MenuItem
                icon={Info}
                iconClassName={worstSeverity ? severityColor[worstSeverity] : undefined}
                label={
                  elementFindings.length === 1
                    ? "View problem"
                    : `View problems (${elementFindings.length})`
                }
                onClick={() => onShowProblems(menu.elementId as string)}
              />
            )}
            {menu.elementId && (
              <MenuItem
                icon={Boxes}
                label={boundAssetName ? `Asset: ${boundAssetName}` : "Bind to asset…"}
                onClick={() => onBindAsset(menu.elementId as string)}
              />
            )}
            {boundAssetName && menu.elementId && (
              <MenuItem
                icon={Unlink}
                label="Unbind asset"
                onClick={() => onUnbindAsset(menu.elementId as string)}
              />
            )}
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
  iconClassName,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  label: string;
  onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e)}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-fg transition-colors hover:bg-elevated"
    >
      <Icon className={cn("size-3.5 text-fg-muted", iconClassName)} />
      {label}
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-hairline" />;
}
