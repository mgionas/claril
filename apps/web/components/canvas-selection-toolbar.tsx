"use client";

import { createRoot } from "react-dom/client";
import { ArrowRight, Pencil, Plus, Trash2, MoreHorizontal } from "lucide-react";

export interface ToolbarServices {
  append: () => void; // spawn a connected node (append)
  connect: () => void; // enter connect mode from this element
  rename: () => void; // trigger direct editing
  remove: () => void; // delete the element
  more: () => void; // open the full context menu as a sheet/popover
}

/** Tap-driven replacement for the hover context-pad. Rendered into a diagram-js
 * overlay anchored to the selected element, so it tracks pan/zoom/move. */
export function CanvasSelectionToolbar({
  services,
  appendable = true,
}: {
  services: ToolbarServices;
  /** Whether the selected element can be a connection source (a plain shape,
   * not a connection/label). Connections can still be renamed/deleted, but
   * append/connect don't make sense from a connection — hide those two. */
  appendable?: boolean;
}) {
  const btn =
    "touch-target inline-flex items-center justify-center rounded-md hover:bg-accent active:bg-accent/70";
  return (
    <div
      className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-md"
      // Overlays render outside React's tree; stop diagram-js from treating
      // taps on the toolbar as canvas interactions.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {appendable && (
        <button className={btn} aria-label="Add connected step" onClick={services.append}>
          <Plus className="size-5" />
        </button>
      )}
      {appendable && (
        <button className={btn} aria-label="Connect to…" onClick={services.connect}>
          <ArrowRight className="size-5" />
        </button>
      )}
      <button className={btn} aria-label="Rename" onClick={services.rename}>
        <Pencil className="size-5" />
      </button>
      <button className={btn} aria-label="Delete" onClick={services.remove}>
        <Trash2 className="size-5" />
      </button>
      <button className={btn} aria-label="More actions" onClick={services.more}>
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}

/** A connection (sequence flow, message flow, association) has a `waypoints`
 * array; a shape (task, event, gateway, label) does not. Append/connect only
 * make sense from a shape — appending or starting a connection from a
 * connection isn't a supported diagram-js operation. */
export function isAppendable(element: { waypoints?: unknown[] } & Record<string, unknown>): boolean {
  return !element.waypoints;
}

/** Minimal structural view of the diagram-js modeler we drive. */
interface ModelerLike {
  get: (name: string) => unknown;
  on: (event: string, cb: (e: { newSelection: unknown[] }) => void) => void;
  off: (event: string, cb: (e: { newSelection: unknown[] }) => void) => void;
}

/** Map toolbar actions onto real modeler services (same services the native
 * context-pad/palette use). Exported for unit testing against fake service
 * stubs — the React render + overlay positioning are visual and covered later
 * via Playwright/device, not here. */
export function buildServices(
  modeler: { get: (name: string) => unknown },
  element: { id: string },
): ToolbarServices {
  const get = <T,>(n: string) => modeler.get(n) as T;
  return {
    append: () => {
      try {
        const factory = get<{ createShape: (a: { type: string }) => unknown }>("elementFactory");
        const shape = factory.createShape({ type: "bpmn:Task" });
        get<{ append: (src: unknown, shape: unknown) => void }>("autoPlace").append(
          element,
          shape,
        );
      } catch (e) {
        console.warn("[selection-toolbar] append failed", e);
      }
    },
    connect: () => {
      try {
        const connect = get<{ start: (ev: Event, el: unknown) => void }>("connect");
        connect.start(new MouseEvent("mousedown"), element);
      } catch (e) {
        console.warn("[selection-toolbar] connect failed", e);
      }
    },
    rename: () => {
      try {
        const de = get<{ activate: (el: unknown) => void }>("directEditing");
        de.activate(element);
      } catch (e) {
        console.warn("[selection-toolbar] rename failed", e);
      }
    },
    remove: () => {
      try {
        const modeling = get<{ removeElements: (els: unknown[]) => void }>("modeling");
        modeling.removeElements([element]);
      } catch (e) {
        console.warn("[selection-toolbar] remove failed", e);
      }
    },
    more: () => {
      try {
        window.dispatchEvent(
          new CustomEvent("claril:open-context-menu", { detail: { id: element.id } }),
        );
      } catch (e) {
        console.warn("[selection-toolbar] more failed", e);
      }
    },
  };
}

/** Show the toolbar overlay whenever exactly one element is selected (coarse
 * only). Returns a cleanup fn that unsubscribes, unmounts the React root, and
 * removes the overlay — call it from the owning effect's cleanup alongside
 * `modeler.destroy()` so nothing leaks across diagram switches / StrictMode
 * remounts. */
export function mountSelectionToolbar(
  modeler: ModelerLike,
  opts: { isCoarse: boolean },
): () => void {
  if (!opts.isCoarse) return () => {};
  const overlays = modeler.get("overlays") as {
    add: (el: unknown, o: unknown) => string;
    remove: (id: string) => void;
  };
  let overlayId: string | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const clear = () => {
    if (overlayId) {
      try {
        overlays.remove(overlayId);
      } catch {
        /* element may already be gone */
      }
    }
    root?.unmount();
    overlayId = null;
    root = null;
  };

  const onChange = (e: { newSelection: unknown[] }) => {
    clear();
    if (e.newSelection.length !== 1) return;
    const element = e.newSelection[0] as { id: string; waypoints?: unknown[] };
    const appendable = isAppendable(element);
    const host = document.createElement("div");
    root = createRoot(host);
    root.render(
      <CanvasSelectionToolbar
        services={buildServices(modeler, element)}
        appendable={appendable}
      />,
    );
    // Anchor above the element; diagram-js keeps it pinned through pan/zoom.
    overlayId = overlays.add(element, {
      position: { bottom: 8, left: 0 },
      scale: false,
      html: host,
    });
  };

  modeler.on("selection.changed", onChange);
  return () => {
    modeler.off("selection.changed", onChange);
    clear();
  };
}
