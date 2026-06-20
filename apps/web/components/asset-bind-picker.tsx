"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Search } from "lucide-react";
import { listAssets, listAssetTypes } from "@/lib/catalog-actions";
import type { Asset, AssetType } from "@claril/db";
import { cn } from "@/lib/utils";

interface AssetBindPickerProps {
  x: number;
  y: number;
  /** Currently-bound asset id for this element, if any (highlighted). */
  currentAssetId?: string;
  onPick: (assetId: string) => void;
  onClose: () => void;
}

/**
 * Cursor-positioned popup that lists the org's catalog assets (grouped by type)
 * so the user can bind one to the selected diagram element. Mirrors the
 * ElementPicker's look so the canvas feels consistent.
 */
export function AssetBindPicker({ x, y, currentAssetId, onPick, onClose }: AssetBindPickerProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [types, setTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listAssets(), listAssetTypes()])
      .then(([a, t]) => {
        if (!alive) return;
        setAssets(a);
        setTypes(t);
      })
      .catch(() => {
        /* surfaced as empty state */
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? assets.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (typeName.get(a.assetTypeId) ?? "").toLowerCase().includes(q),
        )
      : assets;
    const byType = new Map<string, Asset[]>();
    for (const a of filtered) {
      const arr = byType.get(a.assetTypeId) ?? [];
      arr.push(a);
      byType.set(a.assetTypeId, arr);
    }
    return [...byType.entries()];
  }, [assets, query, typeName]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 288));
  const top = Math.max(8, Math.min(y, window.innerHeight - 388));

  return (
    <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="absolute z-50 flex max-h-96 w-72 flex-col overflow-hidden rounded-[10px] border border-hairline bg-panel/95 text-sm shadow-xl backdrop-blur"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
          <Search className="size-3.5 shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bind to asset…"
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {loading ? (
            <p className="px-2 py-6 text-center text-xs text-fg-subtle">Loading catalog…</p>
          ) : assets.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-fg-subtle">
              No assets yet. Create some in the Catalog.
            </p>
          ) : grouped.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-fg-subtle">No matches.</p>
          ) : (
            grouped.map(([typeId, items]) => (
              <div key={typeId} className="mb-1">
                <p className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-fg-subtle">
                  {typeName.get(typeId) ?? "Assets"}
                </p>
                {items.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onPick(a.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-elevated",
                      a.id === currentAssetId && "bg-accent/10 ring-1 ring-inset ring-accent/40",
                    )}
                  >
                    <Boxes className="size-3.5 shrink-0 text-fg-muted" />
                    <span className="truncate">{a.name}</span>
                    {a.id === currentAssetId && (
                      <span className="ml-auto text-[10px] text-accent">bound</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
