"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft } from "lucide-react";
import type { Finding, QuickFix } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import { runAdvisor, runDocGen, saveDiagramContent } from "@/lib/actions";
import { autosnapshotVersion } from "@/lib/version-actions";
import { createVersionCoalescer, type VersionCoalescer } from "@/lib/version-coalescer";
import type { VersionSource } from "@/lib/actions";
import type { DiffMarks } from "@/lib/bpmn-diff";
import type { CanvasApi } from "@/components/bpmn-canvas";
import type { EditPlan } from "@claril/ai-advisor";
import { TopBar, type SaveState } from "@/components/top-bar";
import { AiDrawer } from "@/components/ai-drawer";
import type { ChatTabHandle } from "@/components/chat-tab";
import { CommandBar } from "@/components/command-bar";
import { DocPanel } from "@/components/doc-panel";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";
import { cn } from "@/lib/utils";

// bpmn-js touches the DOM, so it must run client-only.
const BpmnCanvas = dynamic(() => import("@/components/bpmn-canvas"), { ssr: false });

interface BpmnWorkbenchProps {
  diagramId: string;
  diagramName: string;
  initialXml: string;
  userName: string;
  aiConnected: boolean;
  aiProvider?: string;
  /** Persisted AI documentation markdown, loaded server-side (null if none). */
  initialDoc?: string | null;
  /** Persisted chat transcript, loaded server-side (hydrates the chat). */
  initialChatMessages?: { id: string; role: string; parts: unknown }[];
}

/**
 * BPMN workbench: bpmn-js canvas + the deterministic inspector / advisor /
 * asset-binding surface, plus the tabbed AI drawer (Chat + Problems). These are
 * BPMN-only — non-BPMN kinds use a different workbench shell (see workbench.tsx).
 */
export function BpmnWorkbench({
  diagramId,
  diagramName,
  initialXml,
  userName,
  aiConnected,
  aiProvider,
  initialDoc,
  initialChatMessages,
}: BpmnWorkbenchProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [advisorFindings, setAdvisorFindings] = useState<Finding[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [focus, setFocus] = useState<{ id: string; nonce: number }>({ id: "", nonce: 0 });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "problems">("chat");
  // Doc-gen (Markdown), shown in its own slide-over; seeded from persisted doc.
  const [docOpen, setDocOpen] = useState(false);
  const [docMarkdown, setDocMarkdown] = useState<string | null>(initialDoc ?? null);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Which proposal (by toolCallId) is the one currently awaiting review.
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
  // How each resolved proposal ended up (keyed by toolCallId).
  const [resolutions, setResolutions] = useState<Record<string, "approved" | "rolledback">>({});

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphRef = useRef<ProcessGraph | null>(null);
  const findingsRef = useRef<Finding[]>([]);
  const canvasApiRef = useRef<CanvasApi | null>(null);
  const chatHandleRef = useRef<ChatTabHandle>(null);
  // Latest serialized XML from the canvas — read by the History diff + edit undo.
  const currentXmlRef = useRef<string>(initialXml);
  const preEditXmlRef = useRef<string>(initialXml);
  const coalescerRef = useRef<VersionCoalescer | null>(null);

  // Surface AI work in the drawer automatically.
  useEffect(() => {
    if (aiBusy || aiError) setInspectorOpen(true);
  }, [aiBusy, aiError]);

  // Best-effort snapshot of the freshest canvas XML (never blocks the UI).
  const forceSnapshot = useCallback(
    (source: VersionSource, label?: string) => {
      const xml = currentXmlRef.current;
      if (!xml) return;
      void autosnapshotVersion(diagramId, xml, source, label).catch(() => {});
    },
    [diagramId],
  );

  // Lazily build the ambient-edit coalescer (10s idle / 2min cap).
  if (!coalescerRef.current) {
    coalescerRef.current = createVersionCoalescer(() => forceSnapshot("auto"), {
      idleMs: 10_000,
      capMs: 120_000,
    });
  }

  // Cancel any pending auto-snapshot on unmount.
  useEffect(() => {
    return () => {
      coalescerRef.current?.cancel();
    };
  }, []);

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

  // From the canvas context menu: open the drawer's Problems tab and select.
  const handleShowProblems = useCallback((id: string) => {
    setInspectorOpen(true);
    setActiveTab("problems");
    setFocus((prev) => ({ id, nonce: prev.nonce + 1 }));
  }, []);

  const handleXmlChange = useCallback(
    (xml: string) => {
      currentXmlRef.current = xml;
      coalescerRef.current?.onChange();
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

  // Advisor critique: one-click grounded findings, shown in the Problems tab.
  const handleAskAi = useCallback(async () => {
    if (!aiConnected) {
      setSettingsOpen(true);
      return;
    }
    if (!graphRef.current) return;
    setInspectorOpen(true);
    setActiveTab("problems");
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

  // History: read the freshest XML for diffing.
  const getCurrentXml = useCallback(() => currentXmlRef.current ?? null, []);

  const handleRestored = useCallback((xml: string) => {
    currentXmlRef.current = xml;
    void canvasApiRef.current?.reloadXml(xml);
  }, []);

  const handleShowDiff = useCallback(
    (marks: DiffMarks | null) => {
      if (marks) canvasApiRef.current?.showDiff(marks);
      else canvasApiRef.current?.clearDiff();
    },
    [],
  );

  // Doc-gen: generate Markdown, shown in the doc panel and persisted server-side.
  const generateDocs = useCallback(async () => {
    if (!graphRef.current) return;
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
  }, [diagramId]);

  // Open the panel; only generate if we have no doc yet (persisted or prior run).
  const handleGenerateDocs = useCallback(() => {
    if (!aiConnected) {
      setSettingsOpen(true);
      return;
    }
    setDocOpen(true);
    if (!docMarkdown) void generateDocs();
  }, [aiConnected, docMarkdown, generateDocs]);

  // Apply the AI's proposed plan live, marked violet pending review.
  const handleProposal = useCallback((proposed: EditPlan, toolCallId: string) => {
    if (proposed.ops.length === 0) return;
    preEditXmlRef.current = currentXmlRef.current;
    const changed = canvasApiRef.current?.applyEditPlan(proposed) ?? [];
    canvasApiRef.current?.markAiEdit(changed);
    setPendingProposalId(toolCallId); // this proposal is now the one awaiting review
  }, []);

  const handleApplyPlan = useCallback((toolCallId: string) => {
    canvasApiRef.current?.clearAiEdit();
    setResolutions((r) => ({ ...r, [toolCallId]: "approved" }));
    setPendingProposalId(null); // resolved
    forceSnapshot("ai", "AI edit"); // change already applied to the model; snapshot it
  }, [forceSnapshot]);

  const handleDiscardPlan = useCallback((toolCallId: string) => {
    canvasApiRef.current?.clearAiEdit();
    void canvasApiRef.current?.reloadXml(preEditXmlRef.current);
    setResolutions((r) => ({ ...r, [toolCallId]: "rolledback" }));
    setPendingProposalId(null);
  }, []);

  const handleKeepRefining = useCallback((_toolCallId: string) => {
    setInspectorOpen(true);
    setActiveTab("chat");
    chatHandleRef.current?.focusComposer();
  }, []);

  // "Ask AI" from a problem: jump to Chat and seed an instruction.
  const handleAskAiAboutFinding = useCallback((f: Finding) => {
    setInspectorOpen(true);
    setActiveTab("chat");
    const ref = f.elementId ? ` (element ${f.elementId})` : "";
    chatHandleRef.current?.ask(`Help me resolve: "${f.message}"${ref}. Rule ${f.ruleId}.`);
  }, []);

  const getChatContext = useCallback(
    () => ({ graph: graphRef.current, findings: findingsRef.current, diagramId }),
    [diagramId],
  );

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
          diagramId={diagramId}
          diagramName={diagramName}
          userName={userName}
          saveState={saveState}
          aiConnected={aiConnected}
          aiProvider={aiProvider}
          onOpenAiSettings={() => setSettingsOpen(true)}
          history={{
            getCurrentXml,
            onRestored: handleRestored,
            onShowDiff: handleShowDiff,
          }}
        />
        <CommandBar
          onAskAi={handleAskAi}
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
          onRegenerate={generateDocs}
        />

        {/* Drawer toggle — rides the right edge of the (shrinking) canvas. */}
        <button
          type="button"
          onClick={() => setInspectorOpen((o) => !o)}
          title={inspectorOpen ? "Collapse" : aiConnected ? "Open Assistant" : "Open Inspector"}
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

      <AiDrawer
        open={inspectorOpen}
        aiConnected={aiConnected}
        findings={allFindings}
        errorCount={errorCount}
        warningCount={warningCount}
        focusedElementId={focus.id}
        focusNonce={focus.nonce}
        aiBusy={aiBusy}
        chatHandleRef={chatHandleRef}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        getChatContext={getChatContext}
        initialChatMessages={initialChatMessages}
        pendingProposalId={pendingProposalId}
        resolutions={resolutions}
        onProposal={handleProposal}
        onApplyPlan={handleApplyPlan}
        onDiscardPlan={handleDiscardPlan}
        onKeepRefining={handleKeepRefining}
        onGenerateDocs={handleGenerateDocs}
        onReview={handleAskAi}
        onSelect={handleSelectFinding}
        onApplyFix={handleApplyFix}
        onAskAiAboutFinding={handleAskAiAboutFinding}
      />

      <AiSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialProvider={aiProvider}
      />
    </main>
  );
}
