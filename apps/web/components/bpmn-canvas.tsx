"use client";

import { useEffect, useRef, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import minimapModule from "diagram-js-minimap";
import { CanvasPalette } from "@/components/canvas-palette";
import { CanvasContextMenu, type MenuState } from "@/components/canvas-context-menu";
import { ElementPicker } from "@/components/element-picker";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import { inspect, type ProcessGraph } from "@claril/logic-inspector";
import { bpmnRegistryToGraph, type ElementRegistryLike } from "@/lib/bpmn-to-graph";
import { applyQuickFix } from "@/lib/apply-fix";
import { defaultDiagram } from "@/lib/default-diagram";

export interface CanvasApi {
  applyFix: (fix: QuickFix) => void;
}

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import "diagram-js-minimap/assets/diagram-js-minimap.css";

interface BpmnCanvasProps {
  initialXml?: string;
  /** Element to scroll to + select (e.g. when a finding is clicked). */
  focusElementId?: string;
  /** Bumped on each focus request so re-clicking the same finding re-triggers. */
  focusNonce?: number;
  onFindingsChange?: (findings: Finding[]) => void;
  onGraphChange?: (graph: ProcessGraph) => void;
  onXmlChange?: (xml: string) => void;
  onReady?: (api: CanvasApi) => void;
  /** Current findings (used by the context menu's "View problems" action). */
  findings?: Finding[];
  /** Open the Inspector drawer and select the element's finding. */
  onShowProblems?: (elementId: string) => void;
}

const severityRank: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

export default function BpmnCanvas({
  initialXml,
  focusElementId,
  focusNonce,
  onFindingsChange,
  onGraphChange,
  onXmlChange,
  onReady,
  findings,
  onShowProblems,
}: BpmnCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const markedRef = useRef<string[]>([]);
  const connectHandleRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const modeler = new BpmnModeler({
      container,
      additionalModules: [minimapModule],
      minimap: { open: true },
      // Custom renderer colors (themed at the source — also fixes drag/minimap).
      bpmnRenderer: {
        defaultFillColor: "#18181b",
        defaultStrokeColor: "#3f3f46",
        defaultLabelColor: "#fafafa",
      },
    } as ConstructorParameters<typeof BpmnModeler>[0]);
    modelerRef.current = modeler;
    // React StrictMode (dev) mounts effects twice: mount → cleanup → mount.
    // The first modeler is destroyed while its async importXML is still in
    // flight; this flag stops us from touching a destroyed instance.
    let disposed = false;

    const renderFindings = (findings: Finding[]) => {
      const overlays = modeler.get("overlays") as unknown as {
        clear: () => void;
        add: (id: string, type: string, opts: unknown) => void;
      };
      const canvas = modeler.get("canvas") as unknown as {
        addMarker: (id: string, cls: string) => void;
        removeMarker: (id: string, cls: string) => void;
      };

      overlays.clear();
      for (const id of markedRef.current) {
        canvas.removeMarker(id, "claril-flagged-error");
        canvas.removeMarker(id, "claril-flagged-warning");
      }

      // Worst severity per element.
      const worst = new Map<string, Severity>();
      for (const f of findings) {
        if (!f.elementId) continue;
        const current = worst.get(f.elementId);
        if (!current || severityRank[f.severity] > severityRank[current]) {
          worst.set(f.elementId, f.severity);
        }
      }

      const marked: string[] = [];
      for (const [elementId, severity] of worst) {
        try {
          if (severity === "error" || severity === "warning") {
            canvas.addMarker(elementId, `claril-flagged-${severity}`);
          }
          overlays.add(elementId, "claril-finding", {
            position: { top: -10, right: 10 },
            html: `<div class="claril-finding claril-finding--${severity}"></div>`,
          });
          marked.push(elementId);
        } catch {
          // Element may not be present (e.g. mid-edit); ignore.
        }
      }
      markedRef.current = marked;
    };

    const runInspection = () => {
      try {
        const registry = modeler.get("elementRegistry") as unknown as ElementRegistryLike;
        const graph = bpmnRegistryToGraph(registry);
        const findings = inspect(graph);
        onGraphChange?.(graph);
        onFindingsChange?.(findings);
        renderFindings(findings);
      } catch {
        // Ignore transient model states during editing.
      }
    };

    const persist = async () => {
      try {
        const { xml } = await modeler.saveXML({ format: true });
        if (xml) onXmlChange?.(xml);
      } catch {
        // Ignore serialization errors mid-edit.
      }
    };

    const onChanged = () => {
      runInspection();
      void persist();
    };

    void (async () => {
      try {
        const xml = initialXml && initialXml.trim().length > 0 ? initialXml : defaultDiagram;
        await modeler.importXML(xml);
        if (disposed) return;
        const canvas = modeler.get("canvas") as unknown as {
          zoom: (mode: string, center?: string) => void;
        };
        canvas.zoom("fit-viewport", "auto");
        runInspection();
        modeler.on("commandStack.changed", onChanged);

        // Connection handle: a drag node on the selected shape that starts a
        // directional connection (source = the selected element).
        const overlays = modeler.get("overlays") as unknown as {
          add: (id: string, type: string, opts: unknown) => string;
          remove: (id: string) => void;
        };
        const connectService = modeler.get("connect") as unknown as {
          start: (event: Event, source: unknown) => void;
        };
        const showConnectHandle = (el: any) => {
          if (connectHandleRef.current) {
            try {
              overlays.remove(connectHandleRef.current);
            } catch {
              /* ignore */
            }
            connectHandleRef.current = null;
          }
          if (!el || el.waypoints || !el.businessObject || el.type === "label") return;
          const node = document.createElement("div");
          node.className = "claril-connect-handle";
          node.title = "Drag to connect";
          node.addEventListener("mousedown", (ev) => {
            ev.stopPropagation();
            try {
              connectService.start(ev, el);
            } catch {
              /* ignore */
            }
          });
          try {
            connectHandleRef.current = overlays.add(el.id, "claril-connect", {
              position: { right: -8, top: (el.height ?? 36) / 2 - 6 },
              html: node,
            });
          } catch {
            /* ignore */
          }
        };
        modeler.on("selection.changed", (e: { newSelection?: unknown[] }) => {
          const sel = e.newSelection;
          showConnectHandle(sel && sel.length === 1 ? sel[0] : null);
        });

        setReady(true);
        onReady?.({
          applyFix: (fix) => {
            if (modelerRef.current) applyQuickFix(modelerRef.current, fix);
          },
        });
      } catch (err) {
        if (!disposed) console.error("Failed to import diagram", err);
      }
    })();

    // Keep the bpmn viewport correct when the container resizes (e.g. when the
    // Inspector drawer pushes the canvas narrower).
    const resizeObserver = new ResizeObserver(() => {
      try {
        (modeler.get("canvas") as unknown as { resized: () => void }).resized();
      } catch {
        /* ignore */
      }
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      modeler.destroy();
      modelerRef.current = null;
      markedRef.current = [];
    };
  }, [initialXml, onFindingsChange, onGraphChange, onXmlChange, onReady]);

  // Scroll to + select an element when a finding is clicked.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || !focusElementId) return;
    try {
      const registry = modeler.get("elementRegistry") as unknown as {
        get: (id: string) => unknown;
      };
      const element = registry.get(focusElementId);
      if (!element) return;
      const canvas = modeler.get("canvas") as unknown as {
        scrollToElement: (el: unknown) => void;
      };
      const selection = modeler.get("selection") as unknown as {
        select: (el: unknown) => void;
      };
      canvas.scrollToElement(element);
      selection.select(element);
    } catch {
      // Ignore.
    }
  }, [focusElementId, focusNonce]);

  return (
    <div
      className="absolute inset-0"
      onContextMenu={(e) => {
        const node = (e.target as Element).closest?.(".djs-element") as Element | null;
        e.preventDefault();
        setMenu({
          x: e.clientX,
          y: e.clientY,
          elementId: node?.getAttribute("data-element-id") ?? null,
        });
      }}
    >
      {/* Dedicated, React-untouched node for bpmn-js to render into. */}
      <div ref={containerRef} className="absolute inset-0" />
      {ready && modelerRef.current && (
        <CanvasPalette modeler={modelerRef.current} onMore={(x, y) => setPicker({ x, y })} />
      )}
      {menu && modelerRef.current && (
        <CanvasContextMenu
          menu={menu}
          modeler={modelerRef.current}
          findings={findings ?? []}
          onShowProblems={(id) => {
            setMenu(null);
            onShowProblems?.(id);
          }}
          onClose={() => setMenu(null)}
          onCreateMore={(x, y) => {
            setMenu(null);
            setPicker({ x, y });
          }}
        />
      )}
      {picker && modelerRef.current && (
        <ElementPicker
          modeler={modelerRef.current}
          x={picker.x}
          y={picker.y}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
