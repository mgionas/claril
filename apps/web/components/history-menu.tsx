"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  GitCompare,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getVersionContent,
  listVersions,
  restoreVersion,
  type VersionSummary,
} from "@/lib/version-actions";
import type { VersionSource } from "@/lib/actions";
import { computeBpmnDiff, type DiffMarks } from "@/lib/bpmn-diff";
import { cn } from "@/lib/utils";

interface HistoryMenuProps {
  diagramId: string;
  /** Live current XML, read fresh per diff. */
  getCurrentXml: () => string | null;
  /** Reload the canvas with restored content. */
  onRestored: (xml: string) => void;
  /** Color the canvas with the active diff (null clears it). */
  onShowDiff: (
    marks: DiffMarks | null,
  ) => void;
}

const sourceMeta: Record<VersionSource, { label: string; Icon: typeof Clock; cls: string }> = {
  manual: { label: "Saved", Icon: Pencil, cls: "text-fg-muted" },
  auto: { label: "Auto", Icon: RefreshCw, cls: "text-fg-subtle" },
  ai: { label: "AI", Icon: Sparkles, cls: "text-accent" },
  import: { label: "Import", Icon: Upload, cls: "text-info" },
  restore: { label: "Restore", Icon: RotateCcw, cls: "text-warning" },
};

function relativeTime(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function HistoryMenu({ diagramId, getCurrentXml, onRestored, onShowDiff }: HistoryMenuProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setVersions(await listVersions(diagramId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, [diagramId]);

  useEffect(() => {
    if (open) void refresh();
    else onShowDiff(null); // clear any diff coloring when the panel closes
  }, [open, refresh, onShowDiff]);

  const handleRestore = useCallback(
    async (v: VersionSummary) => {
      setBusyId(v.id);
      setError(null);
      try {
        const xml = await restoreVersion(diagramId, v.id);
        onShowDiff(null);
        onRestored(xml);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to restore.");
      } finally {
        setBusyId(null);
      }
    },
    [diagramId, onRestored, onShowDiff, refresh],
  );

  const handleDiff = useCallback(
    async (v: VersionSummary) => {
      const currentXml = getCurrentXml();
      if (!currentXml) return;
      setBusyId(v.id);
      setError(null);
      try {
        const before = await getVersionContent(diagramId, v.id);
        const result = await computeBpmnDiff(before, currentXml);
        onShowDiff({
          added: result.added,
          removed: result.removed,
          changed: result.changed,
          layout: result.layout,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to compute diff.");
      } finally {
        setBusyId(null);
      }
    },
    [diagramId, getCurrentXml, onShowDiff],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Version history"
          className={cn(
            "flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-2 py-1.5 text-fg-muted backdrop-blur transition-colors hover:text-fg",
            open && "text-accent",
          )}
        >
          <Clock className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Clock className="size-4 text-fg-muted" />
            History
          </span>
          <span className="text-xs text-fg-subtle">
            {versions.length} {versions.length === 1 ? "version" : "versions"}
          </span>
        </div>

        {error && <p className="px-4 py-2 text-xs text-error">{error}</p>}

        <ScrollArea className="h-[min(60vh,420px)]">
          {loading && versions.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-fg-subtle">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </p>
          ) : versions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-subtle">
              No versions yet. Edits snapshot automatically as you work.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 p-2">
              {versions.map((v) => {
                const m = sourceMeta[v.source] ?? sourceMeta.manual;
                const Icon = m.Icon;
                return (
                  <li
                    key={v.id}
                    className="group rounded-[8px] border border-hairline bg-elevated/40 px-3 py-2 transition-colors hover:border-fg-subtle"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate text-sm">
                        <Icon className={cn("size-3.5 shrink-0", m.cls)} />
                        <span className={cn("text-[11px] font-medium", m.cls)}>{m.label}</span>
                        {v.label && <span className="truncate text-fg-muted">· {v.label}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-fg-subtle">
                        {relativeTime(v.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDiff(v)}
                        disabled={busyId === v.id}
                        className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
                      >
                        <GitCompare className="size-3" />
                        Diff
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRestore(v)}
                        disabled={busyId === v.id}
                        className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                      >
                        {busyId === v.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3" />
                        )}
                        Restore
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <p className="border-t border-hairline px-4 py-2 text-[10px] text-fg-subtle">
          Restoring snapshots the current state first, so it’s reversible.
        </p>
      </PopoverContent>
    </Popover>
  );
}
