"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft } from "lucide-react";
import type { Finding, QuickFix } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import {
  runAdvisor,
  runAdvisorQuestion,
  runDocGen,
  saveDiagramContent,
} from "@/lib/actions";
import type { CanvasApi } from "@/components/bpmn-canvas";
import { TopBar, type SaveState } from "@/components/top-bar";
import { InspectorPanel } from "@/components/inspector-panel";
import { CommandBar } from "@/components/command-bar";
import { DocPanel } from "@/components/doc-panel";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";
import { cn } from "@/lib/utils";

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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // Q&A (prose answer, distinct from critique findings).
  const [qaQuestion, setQaQuestion] = useState<string | null>(null);
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);
  // Doc-gen (Markdown), shown in its own panel.
  const [docOpen, setDocOpen] = useState(false);
  const [docMarkdown, setDocMarkdown] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphRef = useRef<ProcessGraph | null>(null);
  const findingsRef = useRef<Finding[]>([]);
  const canvasApiRef = useRef<CanvasApi | null>(null);

  // Surface AI work in the drawer automatically.
  useEffect(() => {
    if (aiBusy || aiError) setInspectorOpen(true);
  }, [aiBusy, aiError]);

  const handleReady = useCallback((api: CanvasApi) => {
    canvasApiRef.current = api;
  }, []);

  const handleApplyFix = useCallback((fix: QuickFix) => {
    canvasApiRef.current?.applyFix(fix);
  }, []);

  const handleFindings = useCallback((next: Finding[]) => {
    findingsRef.current = next;
    setFindings(next);
    setAdvisorFindings([]);
  }, []);

  const handleGraph = useCallback((graph: ProcessGraph) => {
    graphRef.current = graph;
  }, []);

  const handleSelectFinding = useCallback(
    (id: string) => setFocus((prev) => ({ id, nonce: prev.nonce + 1 })),
    [],
  );

  // From the canvas context menu: open the drawer and select the element's finding.
  const handleShowProblems = useCallback((id: string) => {
    setInspectorOpen(true);
    setFocus((prev) => ({ id, nonce: prev.nonce + 1 }));
  }, []);

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
      const result = await runAdvisor(graphRef.current, findingsRef.current, undefined, diagramId);
      setAdvisorFindings(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setAiBusy(false);
    }
  }, [aiConnected, diagramId]);

  // Q&A: prose answer to a natural-language question, rendered in the drawer.
  const handleAskQuestion = useCallback(
    async (question: string) => {
      if (!aiConnected) {
        setSettingsOpen(true);
        return;
      }
      const q = question.trim();
      if (!q || !graphRef.current) return;
      setInspectorOpen(true);
      setQaQuestion(q);
      setQaAnswer(null);
      setAiBusy(true);
      setAiError(null);
      try {
        const answer = await runAdvisorQuestion(
          graphRef.current,
          findingsRef.current,
          q,
          diagramId,
        );
        setQaAnswer(answer);
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "AI request failed.");
        setQaQuestion(null);
      } finally {
        setAiBusy(false);
      }
    },
    [aiConnected, diagramId],
  );

  const handleClearQa = useCallback(() => {
    setQaQuestion(null);
    setQaAnswer(null);
  }, []);

  // Doc-gen: generate Markdown documentation, shown in the doc panel.
  const handleGenerateDocs = useCallback(async () => {
    if (!aiConnected) {
      setSettingsOpen(true);
      return;
    }
    if (!graphRef.current) return;
    setDocOpen(true);
    setDocMarkdown(null);
    setDocError(null);
    setDocBusy(true);
    setAiBusy(true);
    try {
      const md = await runDocGen(graphRef.current, findingsRef.current, diagramId);
      setDocMarkdown(md);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setDocBusy(false);
      setAiBusy(false);
    }
  }, [aiConnected, diagramId]);

  const allFindings = advisorFindings.length > 0 ? [...findings, ...advisorFindings] : findings;
  const errorCount = allFindings.filter((f) => f.severity === "error").length;
  const warningCount = allFindings.filter((f) => f.severity === "warning").length;

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-canvas text-fg">
      <div className="relative min-w-0 flex-1">
        <BpmnCanvas
          diagramId={diagramId}
          initialXml={initialXml}
          focusElementId={focus.id}
          focusNonce={focus.nonce}
          onFindingsChange={handleFindings}
          onGraphChange={handleGraph}
          onXmlChange={handleXmlChange}
          onReady={handleReady}
          findings={allFindings}
          onShowProblems={handleShowProblems}
        />
        <TopBar
          diagramName={diagramName}
          userName={userName}
          saveState={saveState}
          aiConnected={aiConnected}
          aiProvider={aiProvider}
          onOpenAiSettings={() => setSettingsOpen(true)}
        />
        <CommandBar
          onAskAi={handleAskAi}
          onAskQuestion={handleAskQuestion}
          onGenerateDocs={handleGenerateDocs}
          aiBusy={aiBusy}
          aiConnected={aiConnected}
        />

        <DocPanel
          open={docOpen}
          onClose={() => setDocOpen(false)}
          markdown={docMarkdown}
          busy={docBusy}
          error={docError}
          diagramName={diagramName}
        />

        {/* Inspector toggle — rides the right edge of the (shrinking) canvas. */}
        <button
          type="button"
          onClick={() => setInspectorOpen((o) => !o)}
          title={inspectorOpen ? "Collapse Inspector" : "Open Inspector"}
          className="absolute right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-[10px] border border-r-0 border-hairline bg-panel/80 px-1.5 py-3 backdrop-blur transition-colors hover:bg-elevated"
        >
          <ChevronLeft
            className={cn("size-4 text-fg-muted transition-transform", inspectorOpen && "rotate-180")}
          />
          {!inspectorOpen && (errorCount > 0 || warningCount > 0) && (
            <span className="flex flex-col items-center gap-1 text-[10px] text-fg-muted">
              {errorCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="size-1.5 rounded-full bg-error" />
                  {errorCount}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="size-1.5 rounded-full bg-warning" />
                  {warningCount}
                </span>
              )}
            </span>
          )}
        </button>
      </div>

      <InspectorPanel
        open={inspectorOpen}
        findings={allFindings}
        focusedElementId={focus.id}
        focusNonce={focus.nonce}
        onSelect={handleSelectFinding}
        onApplyFix={handleApplyFix}
        aiBusy={aiBusy}
        aiError={aiError}
        qaQuestion={qaQuestion}
        qaAnswer={qaAnswer}
        onClearQa={handleClearQa}
      />

      <AiSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialProvider={aiProvider}
      />
    </main>
  );
}
