"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Cpu, Star } from "lucide-react";
import type { AiProvider } from "@claril/ai-advisor";
import { MODEL_CATALOG, getModelInfo } from "@claril/ai-advisor";
import type { AiOverride, ConnectionView } from "@/lib/ai";
import { providerMeta } from "@/lib/ai-providers";
import { ProviderIcon } from "@/components/ai/provider-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface ModelSwitcherProps {
  /** Usable connections (caller filters to `usable`). */
  connections: ConnectionView[];
  orgDefault?: { provider: AiProvider; model: string };
  /** Current per-session override (null = use org default). */
  value: AiOverride | null;
  onChange: (value: AiOverride | null) => void;
  canSetDefault: boolean;
  onSetDefault: (v: { provider: AiProvider; model: string }) => void;
}

interface Entry {
  provider: AiProvider;
  model: string;
  label: string;
}

/** Build the per-provider model list: connection default first, then the rest of
 *  the catalog, de-duplicated. */
function entriesForConnection(c: ConnectionView): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  const push = (model: string) => {
    if (!model || seen.has(model)) return;
    seen.add(model);
    out.push({
      provider: c.provider,
      model,
      label: getModelInfo(c.provider, model)?.label ?? model,
    });
  };
  if (c.defaultModel) push(c.defaultModel);
  for (const m of MODEL_CATALOG[c.provider] ?? []) push(m.id);
  return out;
}

export function ModelSwitcher({
  connections,
  orgDefault,
  value,
  onChange,
  canSetDefault,
  onSetDefault,
}: ModelSwitcherProps) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(
    () =>
      connections.map((c) => ({
        provider: c.provider,
        entries: entriesForConnection(c),
      })),
    [connections],
  );

  // The connections affordance already covers the empty state ("AI: off").
  if (connections.length === 0) return null;

  // Effective selection: override, else org default, else nothing.
  const selected: { provider: AiProvider; model: string } | null = value?.provider
    ? { provider: value.provider, model: value.model ?? orgDefault?.model ?? "" }
    : orgDefault ?? null;

  const triggerLabel = selected
    ? getModelInfo(selected.provider, selected.model)?.label ?? selected.model
    : "Default model";

  const isActive = (e: Entry) =>
    selected?.provider === e.provider && selected?.model === e.model;

  const canSetThisDefault =
    canSetDefault &&
    selected != null &&
    (selected.provider !== orgDefault?.provider || selected.model !== orgDefault?.model);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Model for AI runs this session"
          className={cn(
            "flex max-w-[200px] items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-2.5 py-1.5 text-fg-muted backdrop-blur transition-colors hover:text-fg",
            open && "text-fg",
          )}
        >
          {selected ? (
            <ProviderIcon provider={selected.provider} className="size-3.5 shrink-0 text-accent" />
          ) : (
            <Cpu className="size-3.5 shrink-0 text-fg-subtle" />
          )}
          <span className="truncate text-xs">{triggerLabel}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-0">
        <div className="border-b border-hairline px-3 py-2">
          <p className="text-xs font-medium text-fg">Model</p>
          <p className="text-[11px] text-fg-subtle">Applies to AI runs this session.</p>
        </div>

        <ScrollArea className="max-h-[min(56vh,360px)]">
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {value === null && <Check className="size-3.5 text-accent" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-fg">Use org default</span>
                {orgDefault && (
                  <span className="truncate text-[10px] text-fg-subtle">
                    {providerMeta(orgDefault.provider).label} ·{" "}
                    {getModelInfo(orgDefault.provider, orgDefault.model)?.label ?? orgDefault.model}
                  </span>
                )}
              </span>
            </button>

            {groups.map((g) => (
              <div key={g.provider} className="mt-1.5">
                <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                  <ProviderIcon provider={g.provider} className="size-3" />
                  {providerMeta(g.provider).label}
                </p>
                {g.entries.map((e) => (
                  <button
                    key={`${e.provider}:${e.model}`}
                    type="button"
                    onClick={() => {
                      onChange({ provider: e.provider, model: e.model });
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs transition-colors hover:bg-elevated"
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      {isActive(e) && <Check className="size-3.5 text-accent" />}
                    </span>
                    <span className="truncate text-fg">{e.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>

        {canSetThisDefault && selected && (
          <div className="border-t border-hairline p-1.5">
            <button
              type="button"
              onClick={() => {
                onSetDefault({ provider: selected.provider, model: selected.model });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs text-accent transition-colors hover:bg-accent/10"
            >
              <Star className="size-3.5 shrink-0" />
              Set as org default
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
