"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Finding, QuickFix } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import { runAdvisor, saveDiagramContent } from "@/lib/actions";
import type { CanvasApi } from "@/components/bpmn-canvas";
import { TopBar, type SaveState } from "@/components/top-bar";
import { InspectorPanel } from "@/components/inspector-panel";
import { CommandBar } from "@/components/command-bar";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";

// bpmn-js touches the DOM, so it must run client-only.
const BpmnCanvas = dynamic(() => import("@/components/bpmn-canvas"), { ssr: false });

interface WorkbenchProps {
  diagramId: string;
  diagramName: string;
  initialXml: string;
  userName: string;
  aiConnected: boolean;
  aiProvider?: string;
}

export function Workbench({
  diagramId,
  diagramName,
  initialXml,
  userName,
  aiConnected,
  aiProvider,
}: WorkbenchProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [advisorFindings, setAdvisorFindings] = useState<Finding[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [focus, setFocus] = useState<{ id: string; nonce: number }>({ id: "", nonce: 0 });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphRef = useRef<ProcessGraph | null>(null);
  const findingsRef = useRef<Finding[]>([]);
  const canvasApiRef = useRef<CanvasApi | null>(null);

  const handleReady = useCallback((api: CanvasApi) => {
    canvasApiRef.current = api;
  }, []);

  const handleApplyFix = useCallback((fix: QuickFix) => {
    canvasApiRef.current?.applyFix(fix);
  }, []);

  const handleFindings = useCallback((next: Finding[]) => {
    findingsRef.current = next;
    setFindings(next);
    // A diagram edit invalidates the previous AI advice.
    setAdvisorFindings([]);
  }, []);

  const handleGraph = useCallback((graph: ProcessGraph) => {
    graphRef.current = graph;
  }, []);

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

  const handleAskAi = useCallback(async () => {
    if (!aiConnected) {
      setSettingsOpen(true);
      return;
    }
    if (!graphRef.current) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await runAdvisor(graphRef.current, findingsRef.current);
      setAdvisorFindings(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setAiBusy(false);
    }
  }, [aiConnected]);

  const allFindings = advisorFindings.length > 0 ? [...findings, ...advisorFindings] : findings;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-canvas text-fg">
      <BpmnCanvas
        initialXml={initialXml}
        focusElementId={focus.id}
        focusNonce={focus.nonce}
        onFindingsChange={handleFindings}
        onGraphChange={handleGraph}
        onXmlChange={handleXmlChange}
        onReady={handleReady}
      />
      <TopBar
        diagramName={diagramName}
        userName={userName}
        saveState={saveState}
        aiConnected={aiConnected}
        aiProvider={aiProvider}
        onOpenAiSettings={() => setSettingsOpen(true)}
      />
      <InspectorPanel
        findings={allFindings}
        onSelect={handleSelectFinding}
        onApplyFix={handleApplyFix}
        aiBusy={aiBusy}
        aiError={aiError}
      />
      <CommandBar onAskAi={handleAskAi} aiBusy={aiBusy} aiConnected={aiConnected} />
      <AiSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialProvider={aiProvider}
      />
    </main>
  );
}
