"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import minimapModule from "diagram-js-minimap";
import { CanvasPalette } from "@/components/canvas-palette";
import { CanvasContextMenu, type MenuState } from "@/components/canvas-context-menu";
import { ElementPicker } from "@/components/element-picker";
import { AssetBindPicker } from "@/components/asset-bind-picker";
import {
  bindElementToAsset,
  getDiagramBoundAssets,
  unbindElement,
  type BoundAsset,
} from "@/lib/catalog-actions";
import type { Finding, QuickFix, Severity } from "@claril/shared";
import { inspect, type ProcessGraph } from "@claril/logic-inspector";
import { bpmnRegistryToGraph, type ElementRegistryLike } from "@/lib/bpmn-to-graph";
import { applyQuickFix } from "@/lib/apply-fix";
import { applyEditPlan } from "@/lib/apply-edit-plan";
import type { EditPlan } from "@claril/ai-advisor";
import { defaultDiagram } from "@/lib/default-diagram";

/** Per-element diff classification, used to color the canvas diff overlay. */
export interface DiffMarks {
  added: string[];
  removed: string[];
  changed: string[];
  layout: string[];
}

export interface CanvasApi {
  applyFix: (fix: QuickFix) => void;
  /**
   * Reload the canvas with new XML (e.g. after a version restore) and re-run
   * inspection/persistence. Resolves once imported.
   */
  reloadXml: (xml: string) => Promise<void>;
  /** Color elements present in the current model by diff classification. */
  showDiff: (marks: DiffMarks) => void;
  /** Remove all diff coloring. */
  clearDiff: () => void;
  /** Apply an AI EditPlan as one undoable command; returns changed ids. */
  applyEditPlan: (plan: EditPlan) => string[];
  /** Mark elements an AI proposal just changed (violet, pending review). */
  markAiEdit: (ids: string[]) => void;
  /** Remove all AI-edit marking. */
  clearAiEdit: () => void;
  /** Mark elements that have ≥1 open comment thread (amber). Replaces prior set. */
  setCommentedElements: (ids: string[]) => void;
  /** Remove all comment marking. */
  clearCommentMarkers: () => void;
  /** Ids of all flow elements currently present in the model (for live-set diffing). */
  getElementIds: () => string[];
  /** Id + label of all elements currently present in the model (for comment chips). */
  getElements: () => { id: string; name: string }[];
  /** Select an element and bring it into view (no-op if missing). */
  focusElement: (id: string) => void;
  /** Serialize the current model to formatted BPMN 2.0 XML (canonical artifact). */
  exportXml: () => Promise<string>;
  /** Serialize the current diagram to an SVG string (for PNG/PDF rendering). */
  exportSvg: () => Promise<string>;
}

const DIFF_MARKERS = [
  "claril-diff-added",
  "claril-diff-removed",
  "claril-diff-changed",
  "claril-diff-layout",
] as const;

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import "diagram-js-minimap/assets/diagram-js-minimap.css";

interface BpmnCanvasProps {
  /** Diagram id — enables Asset Catalog element binding. */
  diagramId?: string;
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
  /** Emits the first selected element ({id,name}) or null when nothing is selected. */
  onSelectionChange?: (selected: { id: string; name: string } | null) => void;
  /** Open the Comments tab with a composer anchored to this element. Undefined ⇒ no Comment menu item (e.g. personal diagrams). */
  onCommentElement?: (elementId: string) => void;
  /** Whether the Asset Catalog is available (org diagrams only). Gates the
   *  bound-assets load + the bind/unbind context-menu items — personal diagrams
   *  have no catalog, so those would error against the org-scoped actions. */
  canUseCatalog?: boolean;
}

const severityRank: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

/**
 * Re-fit an exported SVG to the diagram's actual content bounds + a small uniform
 * padding. bpmn-js `saveSVG()` can leave a large empty margin (especially on
 * AI-generated layouts); this crops tight so PNG/PDF exports aren't swimming in
 * whitespace. Falls back to the original SVG if bounds can't be computed.
 */
function cropSvgToContent(
  modeler: { get: (name: string) => unknown },
  svg: string,
  pad = 24,
): string {
  try {
    const registry = modeler.get("elementRegistry") as {
      getAll: () => Array<{
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        waypoints?: Array<{ x: number; y: number }>;
      }>;
    };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of registry.getAll()) {
      if (typeof el.x === "number" && typeof el.width === "number" && typeof el.height === "number") {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y ?? 0);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, (el.y ?? 0) + el.height);
      }
      if (Array.isArray(el.waypoints)) {
        for (const wp of el.waypoints) {
          minX = Math.min(minX, wp.x);
          minY = Math.min(minY, wp.y);
          maxX = Math.max(maxX, wp.x);
          maxY = Math.max(maxY, wp.y);
        }
      }
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return svg;
    const x = Math.round(minX - pad);
    const y = Math.round(minY - pad);
    const w = Math.round(maxX - minX + pad * 2);
    const h = Math.round(maxY - minY + pad * 2);
    return svg
      .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/, `$1 width="${w}"`)
      .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/, `$1 height="${h}"`)
      .replace(/(<svg\b[^>]*?)\sviewBox="[^"]*"/, `$1 viewBox="${x} ${y} ${w} ${h}"`);
  } catch {
    return svg;
  }
}

export default function BpmnCanvas({
  diagramId,
  initialXml,
  focusElementId,
  focusNonce,
  onFindingsChange,
  onGraphChange,
  onXmlChange,
  onReady,
  findings,
  onShowProblems,
  onSelectionChange,
  onCommentElement,
  canUseCatalog,
}: BpmnCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const markedRef = useRef<string[]>([]);
  const findingOverlaysRef = useRef<string[]>([]);
  const diffMarkedRef = useRef<string[]>([]);
  const aiEditMarkedRef = useRef<string[]>([]);
  const commentMarkedRef = useRef<string[]>([]);
  const assetOverlaysRef = useRef<string[]>([]);
  // Latest selection callback, kept in a ref so the modeler effect (which owns
  // the selection.changed subscription) needn't re-run when the prop changes.
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const connectHandleRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [boundAssets, setBoundAssets] = useState<BoundAsset[]>([]);
  const [bindTarget, setBindTarget] = useState<{ elementId: string; x: number; y: number } | null>(
    null,
  );

  // Load the diagram's element→asset bindings (and a manual refresh after edits).
  // Catalog is org-only, so skip entirely for personal diagrams.
  const refreshBoundAssets = useCallback(() => {
    if (!diagramId || !canUseCatalog) return;
    getDiagramBoundAssets(diagramId)
      .then(setBoundAssets)
      .catch(() => setBoundAssets([]));
  }, [diagramId, canUseCatalog]);

  useEffect(() => {
    if (ready) refreshBoundAssets();
  }, [ready, refreshBoundAssets]);

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
        add: (id: string, type: string, opts: unknown) => string;
        remove: (id: string) => void;
      };
      const canvas = modeler.get("canvas") as unknown as {
        addMarker: (id: string, cls: string) => void;
        removeMarker: (id: string, cls: string) => void;
      };

      // Remove only our own finding overlays (not asset badges / connect handle).
      for (const id of findingOverlaysRef.current) {
        try {
          overlays.remove(id);
        } catch {
          /* ignore */
        }
      }
      for (const id of markedRef.current) {
        // removeMarker throws if the element was deleted (diagram-js looks it up
        // by id and dereferences undefined). Guard each call so cleaning up a
        // just-deleted flagged element can't abort the re-render and wipe the
        // markers for the remaining problems.
        try {
          canvas.removeMarker(id, "claril-flagged-error");
          canvas.removeMarker(id, "claril-flagged-warning");
        } catch {
          /* element gone — nothing to unmark */
        }
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
      const overlayIds: string[] = [];
      for (const [elementId, severity] of worst) {
        try {
          if (severity === "error" || severity === "warning") {
            canvas.addMarker(elementId, `claril-flagged-${severity}`);
          }
          overlayIds.push(
            overlays.add(elementId, "claril-finding", {
              position: { top: -10, right: 10 },
              html: `<div class="claril-finding claril-finding--${severity}"></div>`,
            }),
          );
          marked.push(elementId);
        } catch {
          // Element may not be present (e.g. mid-edit); ignore.
        }
      }
      markedRef.current = marked;
      findingOverlaysRef.current = overlayIds;
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

    const clearDiffMarks = () => {
      const canvas = modeler.get("canvas") as unknown as {
        removeMarker: (id: string, cls: string) => void;
      };
      for (const id of diffMarkedRef.current) {
        for (const cls of DIFF_MARKERS) {
          try {
            canvas.removeMarker(id, cls);
          } catch {
            /* element may be gone */
          }
        }
      }
      diffMarkedRef.current = [];
    };

    const applyDiff = (marks: DiffMarks) => {
      clearDiffMarks();
      const canvas = modeler.get("canvas") as unknown as {
        addMarker: (id: string, cls: string) => void;
      };
      const registry = modeler.get("elementRegistry") as unknown as {
        get: (id: string) => unknown;
      };
      const marked = new Set<string>();
      const mark = (ids: string[], cls: string) => {
        for (const id of ids) {
          // Removed elements aren't in the current model — skip (listed in panel).
          if (!registry.get(id)) continue;
          try {
            canvas.addMarker(id, cls);
            marked.add(id);
          } catch {
            /* ignore */
          }
        }
      };
      mark(marks.added, "claril-diff-added");
      mark(marks.changed, "claril-diff-changed");
      mark(marks.layout, "claril-diff-layout");
      // Removed ids are intentionally not marked (absent from current model).
      diffMarkedRef.current = [...marked];
    };

    const clearAiEditMarks = () => {
      const canvas = modeler.get("canvas") as unknown as {
        removeMarker: (id: string, cls: string) => void;
      };
      for (const id of aiEditMarkedRef.current) {
        try {
          canvas.removeMarker(id, "claril-ai-edit");
        } catch {
          /* element may be gone */
        }
      }
      aiEditMarkedRef.current = [];
    };

    const markAiEdit = (ids: string[]) => {
      clearAiEditMarks();
      const canvas = modeler.get("canvas") as unknown as {
        addMarker: (id: string, cls: string) => void;
      };
      const registry = modeler.get("elementRegistry") as unknown as {
        get: (id: string) => unknown;
      };
      const marked = new Set<string>();
      for (const id of ids) {
        if (!registry.get(id)) continue;
        try {
          canvas.addMarker(id, "claril-ai-edit");
          marked.add(id);
        } catch {
          /* ignore */
        }
      }
      aiEditMarkedRef.current = [...marked];
    };

    const clearCommentMarks = () => {
      const canvas = modeler.get("canvas") as unknown as {
        removeMarker: (id: string, cls: string) => void;
      };
      for (const id of commentMarkedRef.current) {
        try {
          canvas.removeMarker(id, "claril-comment");
        } catch {
          /* element may be gone */
        }
      }
      commentMarkedRef.current = [];
    };

    const setCommentedElements = (ids: string[]) => {
      clearCommentMarks();
      const canvas = modeler.get("canvas") as unknown as {
        addMarker: (id: string, cls: string) => void;
      };
      const registry = modeler.get("elementRegistry") as unknown as {
        get: (id: string) => unknown;
      };
      const marked = new Set<string>();
      for (const id of ids) {
        if (!registry.get(id)) continue; // skip ids missing from the model
        try {
          canvas.addMarker(id, "claril-comment");
          marked.add(id);
        } catch {
          /* ignore */
        }
      }
      commentMarkedRef.current = [...marked];
    };

    const getElementIds = (): string[] => {
      try {
        const registry = modeler.get("elementRegistry") as unknown as {
          getAll: () => { id: string }[];
        };
        return registry.getAll().map((e) => e.id);
      } catch {
        return [];
      }
    };

    const getElements = (): { id: string; name: string }[] => {
      try {
        const registry = modeler.get("elementRegistry") as unknown as {
          getAll: () => { id: string; businessObject?: { name?: string } }[];
        };
        return registry.getAll().map((e) => ({ id: e.id, name: e.businessObject?.name ?? "" }));
      } catch {
        return [];
      }
    };

    const focusElement = (id: string) => {
      try {
        const registry = modeler.get("elementRegistry") as unknown as {
          get: (id: string) => unknown;
        };
        const element = registry.get(id);
        if (!element) return;
        const canvas = modeler.get("canvas") as unknown as {
          scrollToElement: (el: unknown) => void;
        };
        const selection = modeler.get("selection") as unknown as {
          select: (el: unknown) => void;
        };
        selection.select(element);
        canvas.scrollToElement(element);
      } catch {
        /* ignore */
      }
    };

    const exportXml = async (): Promise<string> => {
      const m = modelerRef.current;
      if (!m) throw new Error("Canvas is not ready — no diagram to export.");
      const { xml } = await m.saveXML({ format: true });
      return xml ?? "";
    };

    const exportSvg = async (): Promise<string> => {
      const m = modelerRef.current;
      if (!m) throw new Error("Canvas is not ready — no diagram to export.");
      const { svg } = await m.saveSVG();
      if (!svg) return "";
      // Crop tight to content (+ small padding) so PNG/PDF aren't full of margin.
      return cropSvgToContent(m as unknown as { get: (n: string) => unknown }, svg);
    };

    const reloadXml = async (xml: string) => {
      clearDiffMarks();
      clearAiEditMarks();
      clearCommentMarks();
      await modeler.importXML(xml);
      if (disposed) return;
      const canvas = modeler.get("canvas") as unknown as {
        zoom: (mode: string, center?: string) => void;
      };
      canvas.zoom("fit-viewport", "auto");
      runInspection();
      await persist();
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

        // Keyboard shortcuts (undo/redo, etc.). bpmn-js ships KeyboardModule +
        // EditorActions in the Modeler bundle: the keyboard binds implicitly to
        // the canvas SVG on `canvas.init`, and `editorActions` already maps
        // Cmd/Ctrl+Z → commandStack.undo() and Cmd/Ctrl+Shift+Z / Ctrl+Y →
        // commandStack.redo(), which flow through the existing
        // `commandStack.changed` listener (re-inspection + autosave).
        //
        // Because the binding lives on the SVG node — a sibling of bpmn-js's
        // rename `contenteditable` and unrelated to the React-rendered AI/rename
        // inputs — typing in those fields never reaches it. We still install an
        // explicit input guard so the shortcuts are ignored whenever focus (or
        // the event target) is in an editable control, regardless of DOM layout.
        try {
          const keyboard = modeler.get("keyboard") as unknown as {
            _isEventIgnored?: (event: KeyboardEvent) => boolean;
            getBinding?: () => EventTarget | null;
            bind?: () => void;
          };
          const isEditable = (el: EventTarget | null): boolean => {
            const node = el as HTMLElement | null;
            if (!node || typeof node.closest !== "function") return false;
            return Boolean(
              node.closest(
                "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
              ),
            );
          };
          keyboard._isEventIgnored = (event: KeyboardEvent) =>
            isEditable(event.target) || isEditable(document.activeElement);
          // Ensure the keyboard is bound (it binds on canvas.init by default;
          // this is a no-op safety net if that ever changes).
          if (keyboard.getBinding && !keyboard.getBinding() && keyboard.bind) {
            keyboard.bind();
          }
        } catch {
          // Keyboard module unavailable — non-fatal.
        }

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

          // Emit the first selected element ({id,name}) for the comments surface.
          const cb = onSelectionChangeRef.current;
          if (cb) {
            const first = sel && sel.length > 0 ? (sel[0] as any) : null;
            // Skip the root/process element (best-effort: roots have no parent).
            if (first && first.id && first.parent) {
              cb({ id: first.id as string, name: (first.businessObject?.name as string) ?? "" });
            } else {
              cb(null);
            }
          }
        });

        setReady(true);
        onReady?.({
          applyFix: (fix) => {
            if (modelerRef.current) applyQuickFix(modelerRef.current, fix);
          },
          reloadXml,
          showDiff: applyDiff,
          clearDiff: clearDiffMarks,
          applyEditPlan: (plan) =>
            modelerRef.current ? applyEditPlan(modelerRef.current, plan).changedIds : [],
          markAiEdit,
          clearAiEdit: clearAiEditMarks,
          setCommentedElements,
          clearCommentMarkers: clearCommentMarks,
          getElementIds,
          getElements,
          focusElement,
          exportXml,
          exportSvg,
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
      diffMarkedRef.current = [];
      aiEditMarkedRef.current = [];
      commentMarkedRef.current = [];
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

  // Render asset-binding badges as overlays, independent of finding overlays.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || !ready) return;
    const overlays = modeler.get("overlays") as unknown as {
      add: (id: string, type: string, opts: unknown) => string;
      remove: (id: string) => void;
    };
    for (const id of assetOverlaysRef.current) {
      try {
        overlays.remove(id);
      } catch {
        /* ignore */
      }
    }
    const ids: string[] = [];
    for (const b of boundAssets) {
      const node = document.createElement("div");
      node.className = "claril-asset-badge";
      node.title = `${b.assetType.name}: ${b.asset.name}`;
      node.textContent = b.asset.name; // textContent → no HTML injection from names
      try {
        ids.push(
          overlays.add(b.elementId, "claril-asset", {
            position: { bottom: -6, left: 0 },
            html: node,
          }),
        );
      } catch {
        // Element may not be present (e.g. mid-edit); ignore.
      }
    }
    assetOverlaysRef.current = ids;
  }, [ready, boundAssets]);

  const handleBindPick = useCallback(
    (assetId: string) => {
      if (!bindTarget || !diagramId) return;
      const { elementId } = bindTarget;
      setBindTarget(null);
      bindElementToAsset(diagramId, elementId, assetId)
        .then(refreshBoundAssets)
        .catch((err) => console.warn("Bind failed", err));
    },
    [bindTarget, diagramId, refreshBoundAssets],
  );

  const handleUnbind = useCallback(
    (elementId: string) => {
      if (!diagramId) return;
      unbindElement(diagramId, elementId)
        .then(refreshBoundAssets)
        .catch((err) => console.warn("Unbind failed", err));
    },
    [diagramId, refreshBoundAssets],
  );

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
          canBindAssets={Boolean(canUseCatalog)}
          onShowProblems={(id) => {
            setMenu(null);
            onShowProblems?.(id);
          }}
          onComment={
            onCommentElement
              ? (id) => {
                  setMenu(null);
                  onCommentElement(id);
                }
              : undefined
          }
          boundAssetName={
            menu.elementId
              ? boundAssets.find((b) => b.elementId === menu.elementId)?.asset.name
              : undefined
          }
          onBindAsset={(id) => {
            setBindTarget({ elementId: id, x: menu.x, y: menu.y });
            setMenu(null);
          }}
          onUnbindAsset={(id) => {
            setMenu(null);
            handleUnbind(id);
          }}
          onClose={() => setMenu(null)}
          onCreateMore={(x, y) => {
            setMenu(null);
            setPicker({ x, y });
          }}
        />
      )}
      {bindTarget && (
        <AssetBindPicker
          x={bindTarget.x}
          y={bindTarget.y}
          currentAssetId={boundAssets.find((b) => b.elementId === bindTarget.elementId)?.asset.id}
          onPick={handleBindPick}
          onClose={() => setBindTarget(null)}
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
