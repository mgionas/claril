import { Sparkles } from "lucide-react";

export function TopBar() {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-[10px] border border-hairline bg-panel/80 px-3 py-1.5 backdrop-blur">
        <span className="size-2 rounded-full bg-accent" />
        <span className="text-sm font-medium">Claril</span>
        <span className="text-fg-subtle">/</span>
        <span className="text-sm text-fg-muted">Untitled process</span>
      </div>

      <div
        className="pointer-events-auto flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-3 py-1.5 backdrop-blur"
        title="No AI provider configured — everything deterministic still works."
      >
        <Sparkles className="size-3.5 text-fg-subtle" />
        <span className="text-xs text-fg-muted">AI: off</span>
      </div>
    </header>
  );
}
