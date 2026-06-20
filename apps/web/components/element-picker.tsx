"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { ELEMENT_GROUPS, type ElementSpec } from "@/lib/bpmn-elements";

interface ModelerServices {
  get(name: string): any;
}

interface ElementPickerProps {
  modeler: ModelerServices;
  x: number;
  y: number;
  onClose: () => void;
}

/** Grouped, searchable element picker — the "create element → more" surface. */
export function ElementPicker({ modeler, x, y, onClose }: ElementPickerProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ELEMENT_GROUPS;
    return ELEMENT_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  function pick(event: MouseEvent, spec: ElementSpec) {
    try {
      const elementFactory = modeler.get("elementFactory");
      const shape = spec.participant
        ? elementFactory.createParticipantShape()
        : elementFactory.createShape({
            type: spec.type,
            ...(spec.eventDefinitionType
              ? { eventDefinitionType: spec.eventDefinitionType }
              : {}),
            ...(spec.isExpanded ? { isExpanded: true } : {}),
          });
      modeler.get("create").start(event.nativeEvent, shape);
    } catch {
      /* ignore */
    }
    onClose();
  }

  const left = Math.min(x, window.innerWidth - 280);
  const top = Math.min(y, window.innerHeight - 440);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute flex max-h-[440px] w-64 flex-col overflow-hidden rounded-[10px] border border-hairline bg-panel/95 shadow-xl backdrop-blur"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search elements…"
          className="border-b border-hairline bg-transparent px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        <div className="overflow-y-auto py-1">
          {groups.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-fg-subtle">No matches</p>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-fg-subtle">
                {group.label}
              </p>
              {group.items.map((spec) => (
                <button
                  key={spec.label}
                  type="button"
                  onMouseDown={(e) => pick(e, spec)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated hover:text-accent"
                >
                  <spec.Icon className="size-3.5 shrink-0 text-fg-muted" />
                  {spec.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className="border-t border-hairline px-3 py-1.5 text-[10px] text-fg-subtle">
          Click an element, then click the canvas to place it.
        </p>
      </div>
    </div>
  );
}
