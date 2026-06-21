"use client";

import { LogOut, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { HistoryMenu } from "@/components/history-menu";
import { ModelSwitcher, type ModelSwitcherProps } from "@/components/model-switcher";
import type { DiffMarks } from "@/lib/bpmn-diff";
import { cn } from "@/lib/utils";

export type SaveState = "saved" | "saving" | "error";

const saveLabel: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  error: "Save failed",
};

interface TopBarProps {
  diagramId: string;
  diagramName: string;
  userName: string;
  saveState: SaveState;
  aiConnected: boolean;
  aiProvider?: string;
  onOpenAiSettings: () => void;
  /** History menu wiring (BPMN workbench only; omit elsewhere). */
  history?: {
    getCurrentXml: () => string | null;
    onRestored: (xml: string) => void;
    onShowDiff: (
      marks: DiffMarks | null,
    ) => void;
  };
  /** Per-session model override (BPMN workbench only; omit elsewhere). */
  modelSwitcher?: ModelSwitcherProps;
}

export function TopBar({
  diagramId,
  diagramName,
  userName,
  saveState,
  aiConnected,
  aiProvider,
  onOpenAiSettings,
  history,
  modelSwitcher,
}: TopBarProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-[10px] border border-hairline bg-panel/80 px-3 py-1.5 backdrop-blur">
        <Link
          href="/"
          title="Back to projects"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <span className="size-2 rounded-full bg-accent" />
          <span className="text-sm font-medium">Claril</span>
        </Link>
        <span className="text-fg-subtle">/</span>
        <span className="text-sm text-fg-muted">{diagramName}</span>
        <span className="text-fg-subtle">·</span>
        <span className="text-xs text-fg-subtle">{saveLabel[saveState]}</span>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenAiSettings}
          title={
            aiConnected
              ? `AI provider: ${aiProvider ?? "connected"} — click to change`
              : "No AI provider configured — everything deterministic still works. Click to set up."
          }
          className="flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-3 py-1.5 backdrop-blur transition-colors hover:border-fg-subtle"
        >
          <Sparkles className={cn("size-3.5", aiConnected ? "text-accent" : "text-fg-subtle")} />
          <span className="text-xs text-fg-muted">
            {aiConnected ? `AI: ${aiProvider ?? "on"}` : "AI: off"}
          </span>
        </button>
        {aiConnected && modelSwitcher && <ModelSwitcher {...modelSwitcher} />}
        {history && (
          <HistoryMenu
            diagramId={diagramId}
            getCurrentXml={history.getCurrentXml}
            onRestored={history.onRestored}
            onShowDiff={history.onShowDiff}
          />
        )}
        {aiConnected && (
          <Link
            href="/settings/ai"
            title="Manage AI settings"
            className="flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-2 py-1.5 text-fg-muted backdrop-blur transition-colors hover:text-fg"
          >
            <Settings className="size-3.5" />
          </Link>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          title={`Sign out (${userName})`}
          className="flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-3 py-1.5 text-fg-muted backdrop-blur transition-colors hover:text-fg"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    </header>
  );
}
