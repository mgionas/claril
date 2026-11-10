"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { saveDiagramContent } from "@/lib/actions";
import { TopBar } from "@/components/top-bar";
import { useAutosave } from "@/hooks/use-autosave";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";

// Excalidraw touches the DOM/canvas, so the board canvas runs client-only.
const BoardCanvas = dynamic(() => import("@/components/board-canvas"), { ssr: false });

export interface BoardWorkbenchProps {
  diagramId: string;
  diagramName: string;
  initialContent: string;
  userName: string;
  aiConnected: boolean;
  aiProvider?: string;
  diagramScope?: "personal" | "org";
}

/**
 * Workbench shell for Board diagrams (free-draw Excalidraw canvas). Deliberately
 * minimal, mirroring MermaidWorkbench: the deterministic inspector / advisor /
 * asset-binding surface is BPMN-only and is not mounted here. Autosaves the
 * Excalidraw scene JSON via the shared `saveDiagramContent` action.
 */
export function BoardWorkbench(props: BoardWorkbenchProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveContent = useCallback(
    (content: string) => saveDiagramContent(props.diagramId, content),
    [props.diagramId],
  );
  const { saveState, schedule: handleChange, retry: retrySave } = useAutosave(saveContent);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-fg">
      <div className="relative shrink-0">
        <TopBar
          diagramId={props.diagramId}
          diagramName={props.diagramName}
          userName={props.userName}
          saveState={saveState}
          onRetrySave={retrySave}
          aiConnected={props.aiConnected}
          aiProvider={props.aiProvider}
          onOpenAiSettings={() => setSettingsOpen(true)}
        />
        {/* Reserve the top bar's height (it is absolutely positioned). */}
        <div className="h-[58px]" aria-hidden />
      </div>

      <div className="min-h-0 flex-1">
        <BoardCanvas
          diagramId={props.diagramId}
          initialContent={props.initialContent}
          onChange={handleChange}
        />
      </div>

      <AiSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialProvider={props.aiProvider}
        scope={props.diagramScope}
      />
    </main>
  );
}
