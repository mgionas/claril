"use client";

import { useState } from "react";
import { Check, Copy, Download, FileText, Loader2, RefreshCw, X } from "lucide-react";
import { Streamdown } from "streamdown";

interface DocPanelProps {
  open: boolean;
  onClose: () => void;
  /** Generated Markdown, or null while pending / before first run. */
  markdown: string | null;
  busy: boolean;
  error?: string | null;
  /** Diagram name, used for the download filename. */
  diagramName: string;
  /** Re-run doc generation, overwriting the persisted markdown. */
  onRegenerate: () => void;
}

/**
 * A full-height slide-over that shows AI-generated process documentation,
 * rendered as Markdown via streamdown (themed with the dark tokens from
 * globals.css). Supports copy-to-clipboard, download-as-.md, and on-demand
 * regeneration; the markdown itself is persisted per-diagram by the caller.
 */
export function DocPanel({
  open,
  onClose,
  markdown,
  busy,
  error,
  diagramName,
  onRegenerate,
}: DocPanelProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context) — fail quietly.
    }
  };

  const download = () => {
    if (!markdown) return;
    const safeName = diagramName.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "process";
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-canvas/40 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close documentation"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-[32rem] max-w-[90vw] flex-col border-l border-hairline bg-panel/95 backdrop-blur">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <FileText className="size-4 text-accent" />
            Process documentation
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={busy}
              title="Regenerate documentation"
              className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
            >
              <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />
              {busy ? "…" : "Regenerate"}
            </button>
            <button
              type="button"
              onClick={copy}
              disabled={!markdown}
              title="Copy Markdown"
              className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
            >
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!markdown}
              title="Download .md"
              className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
            >
              <Download className="size-3.5" />
              .md
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="ml-1 flex items-center rounded-[6px] p-1 text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {busy && (
            <p className="flex items-center gap-2 text-sm text-accent">
              <Loader2 className="size-4 animate-spin" />
              Generating documentation…
            </p>
          )}
          {error && !busy && <p className="text-sm text-error">{error}</p>}
          {!busy && !error && markdown && (
            <div className="prose-claril">
              <Streamdown>{markdown}</Streamdown>
            </div>
          )}
          {!busy && !error && !markdown && (
            <p className="text-sm text-fg-subtle">No documentation yet.</p>
          )}
        </div>

        {markdown && !busy && (
          <p className="border-t border-hairline px-4 py-2 text-[10px] text-fg-subtle">
            AI-generated from the model + catalog — review before publishing.
          </p>
        )}
      </aside>
    </div>
  );
}
