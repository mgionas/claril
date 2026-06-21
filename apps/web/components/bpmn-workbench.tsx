"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft } from "lucide-react";
import type { Finding, QuickFix } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import {
  getAiSettings,
  runAdvisor,
  runDocGen,
  saveDiagramContent,
  setOrgDefaultModel,
} from "@/lib/actions";
import type { AiOverride, ConnectionView } from "@/lib/ai";
import type { AiProvider } from "@claril/ai-advisor";
import { autosnapshotVersion } from "@/lib/version-actions";
import { createVersionCoalescer, type VersionCoalescer } from "@/lib/version-coalescer";
import type { VersionSource } from "@/lib/actions";
import type { DiffMarks } from "@/lib/bpmn-diff";
import type { CanvasApi } from "@/components/bpmn-canvas";
import type { EditPlan } from "@claril/ai-advisor";
import { TopBar, type SaveState } from "@/components/top-bar";
import { downloadBpmn, downloadPdf, downloadPng } from "@/lib/diagram-export";
import { AiDrawer, type DrawerTab } from "@/components/ai-drawer";
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
  /** Current viewer's user id — threads through to the Comments tab (W16). */
  currentUserId: string;
  aiConnected: boolean;
  aiProvider?: string;
  /** Which AI scope this diagram resolves against — drives the settings dialog. */
  diagramScope?: "personal" | "org";
  /** Whether the viewer is editor+ on this diagram (lets them resolve any thread). */
  canResolveComments?: boolean;
  /** Deep-link: open this comment thread on load (from `?thread=`). */
  initialThreadId?: string;
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
  currentUserId,
  aiConnected,
  aiProvider,
  diagramScope,
  canResolveComments,
  initialThreadId,
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
  const isOrg = diagramScope === "org";
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(initialThreadId));
  const [activeTab, setActiveTab] = useState<DrawerTab>(
    initialThreadId ? "comments" : aiConnected ? "chat" : "problems",
  );
  // First selected canvas element (drives the Comments tab anchor; W16, Task 6).
  const [selectedElement, setSelectedElement] = useState<{ id: string; name: string } | null>(null);
  // Compose-request signal: a right-click "Comment" asks the Comments tab to open
  // a new-comment composer anchored to a specific element (decoupled from the
  // bpmn-js selection, which the right-clicked element may not match). The nonce
  // bumps on every request so re-commenting the same element re-fires.
  const [composeRequest, setComposeRequest] = useState<{
    id: string;
    name: string;
    nonce: number;
  } | null>(null);
  // Live element id/label set from the canvas registry (anchors comment threads).
  const [liveElements, setLiveElements] = useState<{ id: string; name: string }[]>([]);
  // Doc-gen (Markdown), shown in its own slide-over; seeded from persisted doc.
  const [docOpen, setDocOpen] = useState(false);
  const [docMarkdown, setDocMarkdown] = useState<string | null>(initialDoc ?? null);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Per-session provider/model override (null = use org default). Not persisted.
  const [aiOverride, setAiOverride] = useState<AiOverride | null>(null);
  const [aiSettings, setAiSettings] = useState<{
    connections: ConnectionView[];
    orgDefault?: { provider: AiProvider; model: string };
    canEdit: boolean;
  } | null>(null);

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

  // Load the model switcher's data once AI is connected (best-effort).
  useEffect(() => {
    if (!aiConnected) return;
    let cancelled = false;
    getAiSettings()
      .then((s) => {
        if (!cancelled) {
          setAiSettings({
            connections: s.connections,
            orgDefault: s.orgDefault,
            canEdit: s.canEdit,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [aiConnected]);

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

  // Pull the current id/label set from the canvas registry (for the Comments tab).
  const refreshLiveElements = useCallback(() => {
    setLiveElements(canvasApiRef.current?.getElements() ?? []);
  }, []);

  const handleReady = useCallback(
    (api: CanvasApi) => {
      canvasApiRef.current = api;
      refreshLiveElements();
    },
    [refreshLiveElements],
  );

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
      // Element set may have changed (add/remove/rename) — refresh comment anchors.
      refreshLiveElements();
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDiagramContent(diagramId, xml)
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"));
      }, 800);
    },
    [diagramId, refreshLiveElements],
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
      const result = await runAdvisor(
        graphRef.current,
        findingsRef.current,
        undefined,
        diagramId,
        aiOverride ?? undefined,
      );
      setAdvisorFindings(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setAiBusy(false);
    }
  }, [aiConnected, diagramId, aiOverride]);

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
      const md = await runDocGen(
        graphRef.current,
        findingsRef.current,
        diagramId,
        aiOverride ?? undefined,
      );
      setDocMarkdown(md);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setDocBusy(false);
      setAiBusy(false);
    }
  }, [diagramId, aiOverride]);

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
    () => ({
      graph: graphRef.current,
      findings: findingsRef.current,
      diagramId,
      override: aiOverride ?? undefined,
    }),
    [diagramId, aiOverride],
  );

  const allFindings = advisorFindings.length > 0 ? [...findings, ...advisorFindings] : findings;
  const errorCount = allFindings.filter((f) => f.severity === "error").length;
  const warningCount = allFindings.filter((f) => f.severity === "warning").length;

  // Comment anchors derived from the live canvas registry (W16).
  const liveElementIds = liveElements.map((e) => e.id);
  const elementNames: Record<string, string> = {};
  for (const e of liveElements) if (e.name) elementNames[e.id] = e.name;
  const handleFocusElement = useCallback((id: string) => {
    canvasApiRef.current?.focusElement(id);
  }, []);
  const handleCommentedElementsChange = useCallback((ids: string[]) => {
    canvasApiRef.current?.setCommentedElements(ids);
  }, []);
  // Right-click "Comment": open the drawer on the Comments tab and signal it to
  // open a composer anchored to this element (also fly the camera to it).
  function handleCommentElement(elementId: string) {
    const name = elementNames[elementId] ?? "";
    setComposeRequest((prev) => ({ id: elementId, name, nonce: (prev?.nonce ?? 0) + 1 }));
    setInspectorOpen(true);
    setActiveTab("comments");
    canvasApiRef.current?.focusElement(elementId);
  }

  return (
    <main
      className="flex h-screen w-screen overflow-hidden bg-canvas text-fg"
      // Selection is held for the Comments tab (W16, Task 6); surfaced here so the
      // state is observed until the tab consumes it.
      data-selected-element={selectedElement?.id ?? undefined}
    >
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
          onSelectionChange={setSelectedElement}
          onCommentElement={handleCommentElement}
          canUseCatalog={isOrg}
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
          onExport={async (fmt) => {
            const api = canvasApiRef.current;
            if (!api) return;
            try {
              if (fmt === "bpmn") downloadBpmn(await api.exportXml(), diagramName);
              else if (fmt === "png") await downloadPng(await api.exportSvg(), diagramName);
              else await downloadPdf(await api.exportSvg(), diagramName);
            } catch (e) {
              console.error("Export failed", e);
            }
          }}
          modelSwitcher={
            aiSettings
              ? {
                  connections: aiSettings.connections.filter((c) => c.usable),
                  orgDefault: aiSettings.orgDefault,
                  value: aiOverride,
                  onChange: setAiOverride,
                  canSetDefault: aiSettings.canEdit,
                  onSetDefault: async (v) => {
                    await setOrgDefaultModel(v);
                    const next = await getAiSettings();
                    setAiSettings({
                      connections: next.connections,
                      orgDefault: next.orgDefault,
                      canEdit: next.canEdit,
                    });
                    setAiOverride(null);
                  },
                }
              : undefined
          }
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
        isOrg={isOrg}
        currentUserId={currentUserId}
        diagramId={diagramId}
        selectedElement={selectedElement}
        liveElementIds={liveElementIds}
        elementNames={elementNames}
        composeRequest={composeRequest}
        canResolveComments={canResolveComments}
        initialThreadId={initialThreadId}
        onFocusElement={handleFocusElement}
        onCommentedElementsChange={handleCommentedElementsChange}
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
        scope={diagramScope}
      />
    </main>
  );
}
