"use client";

import { useEffect, useRef } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import type { Finding } from "@claril/shared";
import { inspect } from "@claril/logic-inspector";
import { bpmnRegistryToGraph, type ElementRegistryLike } from "@/lib/bpmn-to-graph";
import { defaultDiagram } from "@/lib/default-diagram";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

interface BpmnCanvasProps {
  onFindingsChange?: (findings: Finding[]) => void;
}

export default function BpmnCanvas({ onFindingsChange }: BpmnCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const modeler = new BpmnModeler({ container });

    const runInspection = () => {
      try {
        const registry = modeler.get("elementRegistry") as unknown as ElementRegistryLike;
        onFindingsChange?.(inspect(bpmnRegistryToGraph(registry)));
      } catch {
        // Ignore transient model states during editing.
      }
    };

    void (async () => {
      try {
        await modeler.importXML(defaultDiagram);
        const canvas = modeler.get("canvas") as unknown as {
          zoom: (mode: string, center?: string) => void;
        };
        canvas.zoom("fit-viewport", "auto");
        runInspection();
        modeler.on("commandStack.changed", runInspection);
      } catch (err) {
        console.error("Failed to import diagram", err);
      }
    })();

    return () => {
      modeler.destroy();
    };
  }, [onFindingsChange]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
