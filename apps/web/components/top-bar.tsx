"use client";

import { useState } from "react";
import { AlertCircle, Check, Download, Loader2, LogOut, Settings, Sparkles } from "lucide-react";
import { NavLinkPending } from "@/components/nav-link-pending";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { ExportDialog } from "@/components/export-dialog";
import { HistoryMenu } from "@/components/history-menu";
import { ModelSwitcher, type ModelSwitcherProps } from "@/components/model-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { DiffMarks } from "@/lib/bpmn-diff";
import type { ExportTheme } from "@/lib/diagram-export";
import { cn } from "@/lib/utils";

export type ExportFormat = "bpmn" | "png" | "pdf";

import type { SaveState } from "@/lib/autosaver";

export type { SaveState };


interface TopBarProps {
  diagramId: string;
  diagramName: string;
  userName: string;
  saveState: SaveState;
  /** Retry the last failed save (shown next to "Save failed"). */
  onRetrySave?: () => void;
  aiConnected: boolean;
  aiProvider?: string;
  onOpenAiSettings: () => void;
  /** History menu wiring (BPMN workbench only; omit elsewhere). */
  history?: {
    getCurrentXml: () => string | null;
    onRestored: (xml: string) => Promise<void> | void;
    onShowDiff: (
      marks: DiffMarks | null,
    ) => void;
  };
  /** Per-session model override (BPMN workbench only; omit elsewhere). */
  modelSwitcher?: ModelSwitcherProps;
  /** Diagram export (BPMN workbench only; omit ⇒ no Export menu). PNG/PDF take a
   *  theme so the user can download a light or dark render. */
  onExport?: (format: ExportFormat, theme?: ExportTheme) => Promise<void> | void;
}

export function TopBar({
  diagramId,
  diagramName,
  userName,
  saveState,
  onRetrySave,
  aiConnected,
  aiProvider,
  onOpenAiSettings,
  history,
  modelSwitcher,
  onExport,
}: TopBarProps) {
  const router = useRouter();
  const [exportOpen, setExportOpen] = useState(false);

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
          <NavLinkPending className="ml-0" />
        </Link>
        <span className="text-fg-subtle">/</span>
        <span className="text-sm text-fg-muted">{diagramName}</span>
        <span className="text-fg-subtle">·</span>
        <SaveStatus state={saveState} onRetry={onRetrySave} />
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
        {onExport && (
          <>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              title="Export diagram"
              className="flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-2 py-1.5 text-fg-muted backdrop-blur transition-colors hover:text-fg"
            >
              <Download className="size-3.5" />
            </button>
            <ExportDialog open={exportOpen} onOpenChange={setExportOpen} onExport={onExport} />
          </>
        )}
        {history && (
          <HistoryMenu
            diagramId={diagramId}
            getCurrentXml={history.getCurrentXml}
            onRestored={history.onRestored}
            onShowDiff={history.onShowDiff}
          />
        )}
        <ThemeToggle />
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

/** Autosave status: spinner while saving, check when saved, red + Retry on failure. */
function SaveStatus({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  if (state === "saving") {
    return (
      <span role="status" className="flex items-center gap-1 text-xs text-fg-subtle">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span role="alert" className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="size-3" aria-hidden />
        Save failed
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 rounded-[4px] px-1 font-medium underline underline-offset-2 hover:text-fg"
          >
            Retry
          </button>
        )}
      </span>
    );
  }
  return (
    <span role="status" className="flex items-center gap-1 text-xs text-fg-subtle">
      <Check className="size-3" aria-hidden />
      Saved
    </span>
  );
}
