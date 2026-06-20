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
  initialXml?: string;
  onFindingsChange?: (findings: Finding[]) => void;
  onXmlChange?: (xml: string) => void;
}

export default function BpmnCanvas({
  initialXml,
  onFindingsChange,
  onXmlChange,
}: BpmnCanvasProps) {
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
        const canvas = modeler.get("canvas") as unknown as {
          zoom: (mode: string, center?: string) => void;
        };
        canvas.zoom("fit-viewport", "auto");
        runInspection();
        // commandStack.changed fires on edits (not on the initial import).
        modeler.on("commandStack.changed", onChanged);
      } catch (err) {
        console.error("Failed to import diagram", err);
      }
    })();

    return () => {
      modeler.destroy();
    };
  }, [initialXml, onFindingsChange, onXmlChange]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
