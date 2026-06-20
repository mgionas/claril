"use client";

import { useEffect, useRef } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import type { Finding, Severity } from "@claril/shared";
import { inspect, type ProcessGraph } from "@claril/logic-inspector";
import { bpmnRegistryToGraph, type ElementRegistryLike } from "@/lib/bpmn-to-graph";
import { defaultDiagram } from "@/lib/default-diagram";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

interface BpmnCanvasProps {
  initialXml?: string;
  /** Element to scroll to + select (e.g. when a finding is clicked). */
  focusElementId?: string;
  /** Bumped on each focus request so re-clicking the same finding re-triggers. */
  focusNonce?: number;
  onFindingsChange?: (findings: Finding[]) => void;
  onGraphChange?: (graph: ProcessGraph) => void;
  onXmlChange?: (xml: string) => void;
}

const severityRank: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

export default function BpmnCanvas({
  initialXml,
  focusElementId,
  focusNonce,
  onFindingsChange,
  onGraphChange,
  onXmlChange,
}: BpmnCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const markedRef = useRef<string[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const modeler = new BpmnModeler({ container });
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
      } catch (err) {
        if (!disposed) console.error("Failed to import diagram", err);
      }
    })();

    return () => {
      disposed = true;
      modeler.destroy();
      modelerRef.current = null;
      markedRef.current = [];
    };
  }, [initialXml, onFindingsChange, onGraphChange, onXmlChange]);

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

  return <div ref={containerRef} className="absolute inset-0" />;
}
