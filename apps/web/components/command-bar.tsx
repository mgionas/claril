"use client";

import { useState } from "react";
import { Command, FileText, Loader2, MessageCircle, Send, Sparkles } from "lucide-react";

interface CommandBarProps {
  /** Critique: one-click grounded advisor findings. */
  onAskAi: () => void;
  /** Q&A: answer a natural-language question about the diagram. */
  onAskQuestion: (question: string) => void;
  /** Doc-gen: produce Markdown documentation of the process. */
  onGenerateDocs: () => void;
  aiBusy: boolean;
  aiConnected: boolean;
}

export function CommandBar({
  onAskAi,
  onAskQuestion,
  onGenerateDocs,
  aiBusy,
  aiConnected,
}: CommandBarProps) {
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");

  const submitQuestion = () => {
    const q = question.trim();
    if (!aiConnected) {
      // Let the parent route to the AI setup dialog (same as the other actions).
      onAskQuestion("");
      return;
    }
    if (!q || aiBusy) return;
    onAskQuestion(q);
    setQuestion("");
    setAskOpen(false);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
      <div className="pointer-events-auto flex flex-col items-stretch gap-1.5">
        {askOpen && (
          <div className="flex items-center gap-1 rounded-full border border-hairline bg-panel/90 p-1 pl-3 backdrop-blur">
            <MessageCircle className="size-3.5 shrink-0 text-fg-subtle" />
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitQuestion();
                } else if (e.key === "Escape") {
                  setAskOpen(false);
                }
              }}
              placeholder={
                aiConnected ? "Ask about this diagram…" : "Set up an AI provider to ask…"
              }
              className="w-64 bg-transparent px-1 py-1 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            <button
              type="button"
              onClick={submitQuestion}
              disabled={aiBusy || (aiConnected && question.trim().length === 0)}
              title="Ask"
              className="flex items-center justify-center rounded-full p-1.5 text-accent transition-colors hover:bg-elevated disabled:opacity-50"
            >
              {aiBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </button>
          </div>
        )}

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
            {aiBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {aiBusy ? "Asking…" : "Ask AI"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!aiConnected) {
                onAskQuestion("");
                return;
              }
              setAskOpen((o) => !o);
            }}
            disabled={aiBusy}
            title={aiConnected ? "Ask a question about this diagram" : "Set up an AI provider"}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-60"
          >
            <MessageCircle className="size-3.5" />
            Q&amp;A
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
