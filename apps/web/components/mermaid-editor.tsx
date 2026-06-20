"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { DiagramKind } from "@/lib/default-diagram";

/**
 * Split-pane editor for Mermaid-backed diagram kinds (Sequence, C4). The left
 * pane edits the raw Mermaid source; the right pane renders a live, debounced
 * preview. The diagram `content` is just the Mermaid text, autosaved via the
 * caller's `onChange` (which wires into `saveDiagramContent`).
 *
 * This is the V1 editor for non-BPMN kinds. The `DiagramEditor`-by-kind
 * abstraction (see workbench.tsx) lets a richer native editor replace it later
 * without touching the dispatch or persistence.
 *
 * Mermaid touches the DOM, so this component is mounted client-only.
 */

interface MermaidEditorProps {
  kind: Extract<DiagramKind, "sequence" | "c4">;
  initialContent: string;
  /** Debounced autosave of the Mermaid source (the diagram content). */
  onChange: (content: string) => void;
}

const KIND_LABEL: Record<MermaidEditorProps["kind"], string> = {
  sequence: "Sequence",
  c4: "C4 model",
};

const RENDER_DEBOUNCE_MS = 350;

export default function MermaidEditor({ kind, initialContent, onChange }: MermaidEditorProps) {
  const [source, setSource] = useState(initialContent);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable, DOM-safe id for mermaid.render (it injects an element by this id).
  const reactId = useId();
  const renderId = `claril-mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  // Render the current source to SVG with mermaid. Mermaid is imported lazily so
  // its sizeable bundle never reaches the server or non-Mermaid kinds.
  const render = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setSvg("");
        setError(null);
        return;
      }
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          themeVariables: {
            background: "#0b0b0d",
            primaryColor: "#18181b",
            primaryBorderColor: "#3f3f46",
            primaryTextColor: "#fafafa",
            lineColor: "#71717a",
            textColor: "#fafafa",
            actorBkg: "#18181b",
            actorBorder: "#3f3f46",
            actorTextColor: "#fafafa",
            signalColor: "#a1a1aa",
            signalTextColor: "#fafafa",
            noteBkgColor: "#1f1f23",
            noteBorderColor: "#3f3f46",
            noteTextColor: "#fafafa",
          },
        });
        // Validate first so a syntax error doesn't leave a partial render.
        await mermaid.parse(trimmed);
        const { svg: out } = await mermaid.render(renderId, trimmed);
        setSvg(out);
        setError(null);
      } catch (err) {
        // Keep the last good SVG visible; surface the error inline.
        setError(
          err instanceof Error
            ? err.message.replace(/^Error:\s*/, "")
            : "Could not render the diagram.",
        );
      }
    },
    [renderId],
  );

  // Initial render on mount.
  useEffect(() => {
    void render(initialContent);
    // Only on mount / when the loaded diagram changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent]);

  const handleInput = useCallback(
    (next: string) => {
      setSource(next);
      onChange(next);
      if (renderTimer.current) clearTimeout(renderTimer.current);
      renderTimer.current = setTimeout(() => void render(next), RENDER_DEBOUNCE_MS);
    },
    [onChange, render],
  );

  useEffect(() => {
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, []);

  return (
    <div className="flex h-full w-full">
      {/* Source pane */}
      <div className="flex min-w-0 flex-1 flex-col border-r border-hairline">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
          <span className="text-xs font-medium text-fg-muted">
            {KIND_LABEL[kind]} source
          </span>
          <span className="text-[10px] uppercase tracking-wide text-fg-subtle">Mermaid</span>
        </div>
        <textarea
          value={source}
          onChange={(e) => handleInput(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="flex-1 resize-none bg-canvas p-4 font-mono text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
          placeholder="Type Mermaid here…"
          aria-label={`${KIND_LABEL[kind]} Mermaid source`}
        />
      </div>

      {/* Preview pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
          <span className="text-xs font-medium text-fg-muted">Preview</span>
          {error && (
            <span className="flex items-center gap-1.5 text-[11px] text-error">
              <span className="size-1.5 rounded-full bg-error" />
              Syntax error
            </span>
          )}
        </div>
        <div className="relative flex-1 overflow-auto bg-canvas">
          {svg ? (
            // mermaid output is sanitized (securityLevel: "strict").
            <div
              className="flex min-h-full items-center justify-center p-6 [&_svg]:h-auto [&_svg]:max-w-full"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-subtle">
              {error ? "Fix the error to see the preview." : "Start typing to see a preview."}
            </div>
          )}
          {error && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 m-3 rounded-[8px] border border-error/40 bg-error/10 px-3 py-2 font-mono text-[11px] leading-snug text-error backdrop-blur">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
