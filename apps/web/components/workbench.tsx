"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Finding } from "@claril/shared";
import { saveDiagramContent } from "@/lib/actions";
import { TopBar, type SaveState } from "@/components/top-bar";
import { InspectorPanel } from "@/components/inspector-panel";
import { CommandBar } from "@/components/command-bar";

// bpmn-js touches the DOM, so it must run client-only.
const BpmnCanvas = dynamic(() => import("@/components/bpmn-canvas"), { ssr: false });

interface WorkbenchProps {
  diagramId: string;
  diagramName: string;
  initialXml: string;
  userName: string;
}

export function Workbench({ diagramId, diagramName, initialXml, userName }: WorkbenchProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [focus, setFocus] = useState<{ id: string; nonce: number }>({ id: "", nonce: 0 });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFindings = useCallback((next: Finding[]) => setFindings(next), []);

  const handleSelectFinding = useCallback(
    (id: string) => setFocus((prev) => ({ id, nonce: prev.nonce + 1 })),
    [],
  );

  const handleXmlChange = useCallback(
    (xml: string) => {
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDiagramContent(diagramId, xml)
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"));
      }, 800);
    },
    [diagramId],
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-canvas text-fg">
      <BpmnCanvas
        initialXml={initialXml}
        focusElementId={focus.id}
        focusNonce={focus.nonce}
        onFindingsChange={handleFindings}
        onXmlChange={handleXmlChange}
      />
      <TopBar diagramName={diagramName} userName={userName} saveState={saveState} />
      <InspectorPanel findings={findings} onSelect={handleSelectFinding} />
      <CommandBar />
    </main>
  );
}
