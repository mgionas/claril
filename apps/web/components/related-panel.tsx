"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { getRelatedForDiagram, summarizeRelations } from "@/lib/board-actions";
import type { RelatedGroup } from "@/lib/related";

export interface RelatedPanelProps {
  diagramId: string;
  onClose: () => void;
}

/**
 * Right-side overlay listing diagrams related to `diagramId` via shared
 * catalog assets (deterministic, from `getRelatedForDiagram`), plus an
 * optional AI narrative (`summarizeRelations`) when a provider is configured.
 * Degrades gracefully: no bindings → empty-state hint; AI off/unavailable →
 * list only, no narrative, no error shown.
 */
export function RelatedPanel({ diagramId, onClose }: RelatedPanelProps) {
  const [groups, setGroups] = useState<RelatedGroup[] | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "off">("idle");

  useEffect(() => {
    let cancelled = false;
    setGroups(null);
    setNarrative(null);
    setAiState("idle");
    (async () => {
      const g = await getRelatedForDiagram(diagramId);
      if (cancelled) return;
      setGroups(g);
      if (g.length === 0) return;
      setAiState("loading");
      try {
        const r = await summarizeRelations(diagramId);
        if (cancelled) return;
        setNarrative(r?.text ?? null);
        setAiState(r ? "idle" : "off");
      } catch {
        if (!cancelled) setAiState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diagramId]);

  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-80 overflow-auto border-l border-hairline bg-panel p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Related across diagrams</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-7 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>

      {groups === null && <p className="text-fg-muted">Loading…</p>}

      {groups?.length === 0 && (
        <p className="text-fg-muted">
          No cross-diagram links yet. Bind this diagram&apos;s elements to catalog assets (organization scope) to see
          related diagrams here.
        </p>
      )}

      {narrative && <p className="mb-4 rounded-md bg-elevated p-3 text-fg">{narrative}</p>}
      {aiState === "loading" && <p className="mb-4 text-fg-muted">Summarizing…</p>}

      {groups?.map((g) => (
        <div key={g.asset.id} className="mb-3">
          <div className="font-medium">{g.asset.name}</div>
          <ul className="ml-3 list-disc">
            {g.relatedDiagrams.map((d) => (
              <li key={d.id}>
                <Link className="text-accent hover:underline" href={`/d/${d.id}`}>
                  {d.name}
                </Link>{" "}
                <span className="text-fg-muted">({d.kind})</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
