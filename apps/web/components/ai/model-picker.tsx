"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Sparkles } from "lucide-react";
import type { AiProvider } from "@claril/ai-advisor";
import { listProviderModels, type ProviderModelOption } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProviderIcon } from "@/components/ai/provider-icon";

function contextLabel(m: ProviderModelOption): string | null {
  if (m.contextWindow === undefined) return null;
  return `${Math.round(m.contextWindow / 1000)}K ctx`;
}

function priceLabel(m: ProviderModelOption): string | null {
  if (m.unknownPricing || (m.inputPricePer1M === undefined && m.outputPricePer1M === undefined)) {
    return null;
  }
  return `$${m.inputPricePer1M} / $${m.outputPricePer1M} per 1M`;
}

interface ModelPickerProps {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Refetch trigger; bump to re-query (e.g. after entering a key). */
  refetchKey?: number;
}

/**
 * Provider model combobox: fetches live ids via the server action, annotates
 * each with catalog pricing/context/capabilities, preselects the recommended
 * one, and degrades to the curated catalog if the live fetch fails. Each row
 * shows the provider mark, label, a recommended badge, context window, price,
 * and capability chips.
 */
export function ModelPicker({
  provider,
  apiKey,
  baseUrl,
  value,
  onChange,
  disabled = false,
  refetchKey = 0,
}: ModelPickerProps) {
  const [models, setModels] = useState<ProviderModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
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
  const triggerDisabled = disabled || (loading && models.length === 0);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-fg-muted" htmlFor="model-picker-trigger">
        Model
      </Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="model-picker-trigger"
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={triggerDisabled}
            className="h-auto w-full justify-between bg-elevated px-3 py-2 text-left font-normal hover:bg-elevated"
          >
            <span className="flex min-w-0 items-center gap-2">
              {loading && models.length === 0 ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-fg-subtle" />
              ) : (
                <ProviderIcon provider={provider} className="size-4 shrink-0 text-fg-muted" />
              )}
              <span className="truncate text-sm text-fg">
                {loading && models.length === 0
                  ? "Loading models…"
                  : selected
                    ? selected.label
                    : value || "Select a model"}
              </span>
              {selected?.recommended && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-accent/40 bg-accent/10 px-1.5 py-0 text-[10px] text-accent"
                >
                  <Sparkles className="size-2.5" />
                  recommended
                </Badge>
              )}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[20rem] border-hairline bg-panel p-0"
        >
          <Command className="bg-transparent">
            <CommandInput placeholder="Search models…" className="text-sm" />
            <CommandList>
              <CommandEmpty className="py-6 text-center text-sm text-fg-muted">
                {loading ? "Fetching models…" : "No models found."}
              </CommandEmpty>
              <CommandGroup className="p-1.5">
                {models.map((m) => {
                  const ctx = contextLabel(m);
                  const price = priceLabel(m);
                  const isSelected = m.id === value;
                  return (
                    <CommandItem
                      key={m.id}
                      value={`${m.label} ${m.id}`}
                      onSelect={() => {
                        onChange(m.id);
                        setOpen(false);
                      }}
                      className="flex flex-col items-stretch gap-1.5 rounded-[6px] px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <ProviderIcon
                          provider={provider}
                          className="size-4 shrink-0 text-fg-muted"
                        />
                        <span className="truncate text-sm font-medium text-fg">{m.label}</span>
                        {m.recommended && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-accent/40 bg-accent/10 px-1.5 py-0 text-[10px] text-accent"
                          >
                            <Sparkles className="size-2.5" />
                            recommended
                          </Badge>
                        )}
                        <Check
                          className={cn(
                            "ml-auto size-4 shrink-0 text-accent",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pl-6">
                        {ctx && <span className="font-mono text-[10px] text-fg-subtle">{ctx}</span>}
                        {price ? (
                          <span className="font-mono text-[10px] text-fg-subtle">{price}</span>
                        ) : (
                          <span className="text-[10px] text-fg-subtle">no pricing info</span>
                        )}
                        {m.capabilities.map((c) => (
                          <Badge
                            key={c}
                            variant="outline"
                            className="border-hairline bg-elevated px-1.5 py-0 text-[10px] font-normal text-fg-muted"
                          >
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="min-h-[1rem] text-[11px] text-fg-subtle">
        {loading ? (
          "Fetching available models…"
        ) : selected ? (
          <span className="flex flex-wrap items-center gap-x-1.5">
            {selected.capabilities.length > 0 && <span>{selected.capabilities.join(" · ")}</span>}
            {priceLabel(selected) ?? "no pricing info"}
          </span>
        ) : null}
      </div>
      {notice && <p className="text-[11px] text-warning">{notice}</p>}
    </div>
  );
}
