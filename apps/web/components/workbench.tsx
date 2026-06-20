"use client";

import type { DiagramKind } from "@/lib/default-diagram";
import { BpmnWorkbench } from "@/components/bpmn-workbench";
import { MermaidWorkbench } from "@/components/mermaid-workbench";

interface WorkbenchProps {
  diagramId: string;
  diagramName: string;
  kind: DiagramKind;
  initialContent: string;
  userName: string;
  aiConnected: boolean;
  aiProvider?: string;
  /** Persisted AI documentation markdown (BPMN only); null if none. */
  initialDoc?: string | null;
  /** Persisted chat transcript (BPMN only); hydrates the chat. */
  initialChatMessages?: { id: string; role: string; parts: unknown }[];
}

/**
 * Workbench dispatch by diagram kind. BPMN renders the bpmn-js canvas plus the
 * deterministic inspector / advisor / asset-binding surface (BPMN-only).
 * Sequence and C4 render the Mermaid-based editor (V1); those kinds never mount
 * the inspector. The DiagramEditor-by-kind boundary lives here so a richer
 * native editor can replace Mermaid for a kind without touching the rest.
 */
export function Workbench({
  diagramId,
  diagramName,
  kind,
  initialContent,
  userName,
  aiConnected,
  aiProvider,
  initialDoc,
  initialChatMessages,
}: WorkbenchProps) {
  if (kind === "bpmn") {
    return (
      <BpmnWorkbench
        diagramId={diagramId}
        diagramName={diagramName}
        initialXml={initialContent}
        userName={userName}
        aiConnected={aiConnected}
        aiProvider={aiProvider}
        initialDoc={initialDoc}
        initialChatMessages={initialChatMessages}
      />
    );
  }

  return (
    <MermaidWorkbench
      diagramId={diagramId}
      diagramName={diagramName}
      kind={kind}
      initialContent={initialContent}
      userName={userName}
      aiConnected={aiConnected}
      aiProvider={aiProvider}
    />
  );
}
