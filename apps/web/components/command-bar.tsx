"use client";

import { Command, FileText, Loader2, Sparkles } from "lucide-react";

interface CommandBarProps {
  /** Critique: one-click grounded advisor findings. */
  onAskAi: () => void;
  /** Doc-gen: produce Markdown documentation of the process. */
  onGenerateDocs: () => void;
  aiBusy: boolean;
  aiConnected: boolean;
}

export function CommandBar({ onAskAi, onGenerateDocs, aiBusy, aiConnected }: CommandBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
      <div className="pointer-events-auto flex flex-col items-stretch gap-1.5">
        <div className="flex items-center gap-1 self-center rounded-full border border-hairline bg-panel/80 p-1 backdrop-blur">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:bg-elevated"
          >
            <Command className="size-3.5" />
            <span className="text-xs">K</span>
          </button>
          <span className="mx-0.5 h-4 w-px bg-hairline" />
          <button
            type="button"
            onClick={onAskAi}
            disabled={aiBusy}
            title={
              aiConnected ? "Ask the AI advisor to critique this diagram" : "Set up an AI provider"
            }
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-accent transition-colors hover:bg-elevated disabled:opacity-60"
          >
            {aiBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {aiBusy ? "Asking…" : "Ask AI"}
          </button>
          <button
            type="button"
            onClick={onGenerateDocs}
            disabled={aiBusy}
            title={aiConnected ? "Generate Markdown documentation" : "Set up an AI provider"}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-60"
          >
            <FileText className="size-3.5" />
            Docs
          </button>
        </div>
      </div>
    </div>
  );
}
