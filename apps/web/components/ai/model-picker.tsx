"use client";

import { useEffect, useRef, useState } from "react";
import type { AiProvider } from "@claril/ai-advisor";
import { listProviderModels, type ProviderModelOption } from "@/lib/ai-models";

const fieldClass =
  "rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent";

function priceRemark(m: ProviderModelOption): string {
  if (m.unknownPricing || (m.inputPricePer1M === undefined && m.outputPricePer1M === undefined)) {
    return "no pricing info";
  }
  const ctx =
    m.contextWindow !== undefined ? `${Math.round(m.contextWindow / 1000)}K ctx · ` : "";
  return `${ctx}$${m.inputPricePer1M}/$${m.outputPricePer1M} per 1M in/out`;
}

interface ModelPickerProps {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  value: string;
  onChange: (id: string) => void;
  /** Refetch trigger; bump to re-query (e.g. after entering a key). */
  refetchKey?: number;
}

/**
 * Provider model dropdown: fetches live ids via the server action, annotates
 * each with catalog pricing/context/capabilities, preselects the recommended
 * one, and degrades to the curated catalog if the live fetch fails.
 */
export function ModelPicker({
  provider,
  apiKey,
  baseUrl,
  value,
  onChange,
  refetchKey = 0,
}: ModelPickerProps) {
  const [models, setModels] = useState<ProviderModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProviderModels(provider, apiKey || undefined, baseUrl || undefined)
      .then((res) => {
        if (cancelled) return;
        setModels(res.models);
        setNotice(res.notice);
        // Preselect recommended (or first) when the current value isn't offered.
        const has = res.models.some((m) => m.id === value);
        if (!has && res.models.length > 0) {
          const rec = res.models.find((m) => m.recommended) ?? res.models[0];
          onChangeRef.current(rec.id);
        }
      })
      .catch(() => {
        if (!cancelled) setNotice("Couldn't load models — showing the built-in list.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, apiKey, baseUrl, refetchKey]);

  const selected = models.find((m) => m.id === value);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">Model</span>
      <select
        className={fieldClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading && models.length === 0}
      >
        {models.length === 0 && <option value="">{loading ? "Loading…" : "No models"}</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id} className="bg-panel">
            {m.label}
            {m.recommended ? " ✦ recommended" : ""} — {priceRemark(m)}
          </option>
        ))}
      </select>
      <div className="min-h-[1rem] text-[11px] text-fg-subtle">
        {loading
          ? "Fetching available models…"
          : selected
            ? `${selected.capabilities.length > 0 ? selected.capabilities.join(" · ") + " · " : ""}${priceRemark(selected)}`
            : null}
      </div>
      {notice && <p className="text-[11px] text-warning">{notice}</p>}
    </div>
  );
}
