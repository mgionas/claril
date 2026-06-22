"use client";

import { useEffect, useState } from "react";
import { Command, FileText, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CommandBarProps {
  /** Critique: one-click grounded advisor findings. */
  onAskAi: () => void;
  /** Doc-gen: produce Markdown documentation of the process. */
  onGenerateDocs: () => void;
  aiBusy: boolean;
  aiConnected: boolean;
}

/** Keyboard shortcuts grouped for the help modal. `mod` = ⌘ on macOS, Ctrl elsewhere. */
const SHORTCUT_GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Edit",
    items: [
      { keys: ["mod", "Z"], label: "Undo" },
      { keys: ["mod", "⇧", "Z"], label: "Redo" },
      { keys: ["mod", "X"], label: "Cut" },
      { keys: ["mod", "C"], label: "Copy" },
      { keys: ["mod", "V"], label: "Paste" },
      { keys: ["mod", "D"], label: "Duplicate" },
      { keys: ["mod", "A"], label: "Select all" },
      { keys: ["⌫"], label: "Delete selection" },
    ],
  },
  {
    title: "Tools",
    items: [
      { keys: ["H"], label: "Hand tool — pan" },
      { keys: ["L"], label: "Lasso select" },
      { keys: ["S"], label: "Space tool" },
      { keys: ["C"], label: "Connect tool" },
      { keys: ["E"], label: "Rename element" },
      { keys: ["R"], label: "Change element type" },
      { keys: ["F"], label: "Find element" },
    ],
  },
  {
    title: "View",
    items: [
      { keys: ["mod", "+"], label: "Zoom in" },
      { keys: ["mod", "−"], label: "Zoom out" },
      { keys: ["mod", "0"], label: "Reset zoom" },
    ],
  },
];

export function CommandBar({ onAskAi, onGenerateDocs, aiBusy, aiConnected }: CommandBarProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  // ⌘K / Ctrl+K toggles the shortcuts help (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
      ) {
        return;
      }
      e.preventDefault();
      setShortcutsOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const renderKey = (k: string) => (k === "mod" ? (isMac ? "⌘" : "Ctrl") : k);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
        <div className="pointer-events-auto flex flex-col items-stretch gap-1.5">
          <div className="flex items-center gap-1 self-center rounded-full border border-hairline bg-panel/80 p-1 backdrop-blur">
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              title="Keyboard shortcuts (⌘K)"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
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

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription className="text-fg-muted">
              Work the canvas faster. Tool keys apply when the canvas is focused.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {group.title}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {group.items.map((item) => (
                    <li key={item.label} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-fg-muted">{item.label}</span>
                      <span className="flex items-center gap-1">
                        {item.keys.map((k, i) => (
                          <kbd
                            key={i}
                            className="inline-flex min-w-[1.5rem] items-center justify-center rounded-[5px] border border-hairline bg-elevated px-1.5 py-0.5 text-xs font-medium text-fg"
                          >
                            {renderKey(k)}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
