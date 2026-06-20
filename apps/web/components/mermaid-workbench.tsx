"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { saveDiagramContent } from "@/lib/actions";
import { TopBar, type SaveState } from "@/components/top-bar";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";
import type { DiagramKind } from "@/lib/default-diagram";

// Mermaid touches the DOM, so the editor runs client-only.
const MermaidEditor = dynamic(() => import("@/components/mermaid-editor"), { ssr: false });

interface MermaidWorkbenchProps {
  diagramId: string;
  diagramName: string;
  kind: Extract<DiagramKind, "sequence" | "c4">;
  initialContent: string;
  userName: string;
  aiConnected: boolean;
  aiProvider?: string;
}

/**
 * Workbench shell for Mermaid-backed kinds (Sequence, C4). Deliberately minimal:
 * the deterministic inspector / advisor / asset-binding are BPMN-only and are
 * not mounted here. Autosaves the Mermaid source via the shared
 * `saveDiagramContent` action (content is just a string).
 */
export function MermaidWorkbench({
  diagramId,
  diagramName,
  kind,
  initialContent,
  userName,
  aiConnected,
  aiProvider,
}: MermaidWorkbenchProps) {
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (content: string) => {
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDiagramContent(diagramId, content)
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"));
      }, 800);
    },
    [diagramId],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-fg">
      <div className="relative shrink-0">
        <TopBar
          diagramName={diagramName}
          userName={userName}
          saveState={saveState}
          aiConnected={aiConnected}
          aiProvider={aiProvider}
          onOpenAiSettings={() => setSettingsOpen(true)}
        />
        {/* Reserve the top bar's height (it is absolutely positioned). */}
        <div className="h-[58px]" aria-hidden />
      </div>

      <div className="min-h-0 flex-1">
        <MermaidEditor kind={kind} initialContent={initialContent} onChange={handleChange} />
      </div>

      <AiSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialProvider={aiProvider}
      />
    </main>
  );
}
