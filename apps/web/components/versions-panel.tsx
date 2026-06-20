"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  GitCompare,
  History,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Move,
} from "lucide-react";
import { createDiagramVersion } from "@/lib/actions";
import {
  getVersionContent,
  listVersions,
  restoreVersion,
  type VersionSummary,
} from "@/lib/version-actions";
import { computeBpmnDiff, type BpmnDiffResult, type DiffKind } from "@/lib/bpmn-diff";
import { cn } from "@/lib/utils";

interface VersionsPanelProps {
  open: boolean;
  diagramId: string;
  /** Live current XML, supplied by the Workbench (read fresh per diff). */
  getCurrentXml: () => string | null;
  /** Reload the canvas + re-run inspection with restored content. */
  onRestored: (xml: string) => void;
  /** Color the canvas with the active diff (null clears it). */
  onShowDiff: (
    marks: { added: string[]; removed: string[]; changed: string[]; layout: string[] } | null,
  ) => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const kindMeta: Record<DiffKind, { label: string; dot: string; text: string; Icon: typeof Plus }> =
  {
    added: { label: "Added", dot: "bg-success", text: "text-success", Icon: Plus },
    removed: { label: "Removed", dot: "bg-error", text: "text-error", Icon: Minus },
    changed: { label: "Changed", dot: "bg-warning", text: "text-warning", Icon: Pencil },
    layout: { label: "Moved", dot: "bg-info", text: "text-info", Icon: Move },
  };

/**
 * In-flow, full-height History drawer. Mirrors the InspectorPanel layout (takes
 * layout width so it shrinks the canvas rather than overlaying it). Lists named
 * versions with relative time + author, lets you snapshot a new version, and
 * per-version Restore / Diff. The diff view shows a semantic added/removed/
 * changed/moved list and colors the canvas via {@link onShowDiff}.
 */
export function VersionsPanel({
  open,
  diagramId,
  getCurrentXml,
  onRestored,
  onShowDiff,
}: VersionsPanelProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Diff state: which version is being compared against current.
  const [diffVersion, setDiffVersion] = useState<VersionSummary | null>(null);
  const [diff, setDiff] = useState<BpmnDiffResult | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setVersions(await listVersions(diagramId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load versions.");
    } finally {
      setLoading(false);
    }
  }, [diagramId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Clear any canvas diff coloring when the drawer closes.
  useEffect(() => {
    if (!open) {
      setDiffVersion(null);
      setDiff(null);
      onShowDiff(null);
    }
  }, [open, onShowDiff]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await createDiagramVersion(diagramId, label.trim() || undefined);
      setLabel("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save version.");
    } finally {
      setSaving(false);
    }
  }, [diagramId, label, refresh]);

  const handleRestore = useCallback(
    async (v: VersionSummary) => {
      setBusyId(v.id);
      setError(null);
      try {
        const xml = await restoreVersion(diagramId, v.id);
        onShowDiff(null);
        setDiffVersion(null);
        setDiff(null);
        onRestored(xml);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to restore version.");
      } finally {
        setBusyId(null);
      }
    },
    [diagramId, onRestored, onShowDiff, refresh],
  );

  const handleDiff = useCallback(
    async (v: VersionSummary) => {
      const currentXml = getCurrentXml();
      if (!currentXml) {
        setError("Canvas not ready for diff.");
        return;
      }
      setDiffVersion(v);
      setDiff(null);
      setDiffBusy(true);
      setError(null);
      try {
        const before = await getVersionContent(diagramId, v.id);
        const result = await computeBpmnDiff(before, currentXml);
        setDiff(result);
        onShowDiff({
          added: result.added,
          removed: result.removed,
          changed: result.changed,
          layout: result.layout,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to compute diff.");
        setDiffVersion(null);
      } finally {
        setDiffBusy(false);
      }
    },
    [diagramId, getCurrentXml, onShowDiff],
  );

  const closeDiff = useCallback(() => {
    setDiffVersion(null);
    setDiff(null);
    onShowDiff(null);
  }, [onShowDiff]);

  const summaryChips = useMemo(() => {
    if (!diff) return null;
    const items: { kind: DiffKind; n: number }[] = [
      { kind: "added", n: diff.summary.added },
      { kind: "removed", n: diff.summary.removed },
      { kind: "changed", n: diff.summary.changed },
      { kind: "layout", n: diff.summary.layout },
    ];
    return items.filter((i) => i.n > 0);
  }, [diff]);

  return (
    <aside
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        open ? "w-80" : "w-0",
      )}
    >
      <div className="flex h-full w-80 flex-col border-l border-hairline bg-panel/90 backdrop-blur">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            {diffVersion ? (
              <>
                <GitCompare className="size-4 text-accent" />
                Diff
              </>
            ) : (
              <>
                <History className="size-4 text-fg-muted" />
                History
              </>
            )}
          </span>
          {diffVersion ? (
            <button
              type="button"
              onClick={closeDiff}
              title="Back to history"
              className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </button>
          ) : (
            <span className="text-xs text-fg-subtle">
              {versions.length} {versions.length === 1 ? "version" : "versions"}
            </span>
          )}
        </div>

        {error && <p className="px-4 py-2 text-xs text-error">{error}</p>}

        {/* DIFF VIEW */}
        {diffVersion ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-xs text-fg-muted">
              <span className="text-fg">{diffVersion.label || "Unnamed version"}</span>
              <span className="text-fg-subtle"> → current</span>
            </p>
            {diffBusy && (
              <p className="flex items-center gap-2 py-4 text-sm text-accent">
                <Loader2 className="size-4 animate-spin" />
                Computing diff…
              </p>
            )}
            {!diffBusy && diff && (
              <>
                {summaryChips && summaryChips.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {summaryChips.map(({ kind, n }) => {
                      const m = kindMeta[kind];
                      return (
                        <span
                          key={kind}
                          className="flex items-center gap-1 rounded-full border border-hairline bg-elevated/60 px-2 py-0.5 text-[11px]"
                        >
                          <span className={cn("size-1.5 rounded-full", m.dot)} />
                          <span className={m.text}>{n}</span>
                          <span className="text-fg-subtle">{m.label.toLowerCase()}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-fg-subtle">
                    No differences — identical to current ✓
                  </p>
                )}

                <ul className="flex flex-col gap-1">
                  {diff.entries.map((entry) => {
                    const m = kindMeta[entry.kind];
                    const Icon = m.Icon;
                    return (
                      <li
                        key={`${entry.kind}-${entry.elementId}`}
                        className="rounded-[6px] border border-hairline bg-elevated/40 px-2 py-2"
                      >
                        <div className="flex items-start gap-2">
                          <Icon className={cn("mt-0.5 size-3.5 shrink-0", m.text)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm leading-snug">
                              {entry.name || entry.type}
                            </p>
                            <p className="font-mono text-[10px] text-fg-subtle">
                              {entry.type} · {entry.elementId}
                            </p>
                            {entry.attrs && entry.attrs.length > 0 && (
                              <ul className="mt-1 flex flex-col gap-0.5">
                                {entry.attrs.map((a) => (
                                  <li key={a.attr} className="font-mono text-[10px] text-fg-muted">
                                    <span className="text-fg-subtle">{a.attr}: </span>
                                    <span className="text-error line-through">{a.oldValue}</span>
                                    {" → "}
                                    <span className="text-success">{a.newValue}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[10px] text-fg-subtle">
                  Added / changed / moved elements are highlighted on the canvas. Removed elements
                  exist only in the older version.
                </p>
              </>
            )}
          </div>
        ) : (
          /* HISTORY LIST */
          <>
            <div className="border-b border-hairline p-3">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !saving) void handleSave();
                  }}
                  placeholder="Version label (optional)"
                  className="min-w-0 flex-1 rounded-[6px] border border-hairline bg-elevated/60 px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  title="Save a snapshot of the current diagram"
                  className="flex shrink-0 items-center gap-1 rounded-[6px] border border-hairline bg-accent/10 px-2.5 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Save
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading && versions.length === 0 ? (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-fg-subtle">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </p>
              ) : versions.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-fg-subtle">
                  No versions yet. Save one to start tracking history.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {versions.map((v) => (
                    <li
                      key={v.id}
                      className="group rounded-[6px] border border-hairline bg-elevated/40 px-3 py-2 transition-colors hover:border-fg-subtle"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {v.label || "Unnamed version"}
                        </span>
                        <span className="shrink-0 text-[11px] text-fg-subtle">
                          {relativeTime(v.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-fg-subtle">
                        {v.author ? `by ${v.author}` : "unknown author"}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDiff(v)}
                          className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
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
                  ))}
                </ul>
              )}
            </div>
            <p className="border-t border-hairline px-4 py-2 text-[10px] text-fg-subtle">
              Restoring snapshots the current state first, so it’s reversible.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
