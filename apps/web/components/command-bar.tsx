import { Command, Sparkles } from "lucide-react";

export function CommandBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-hairline bg-panel/80 p-1 backdrop-blur">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:bg-elevated"
        >
          <Command className="size-3.5" />
          <span className="text-xs">K</span>
        </button>
        <span className="mx-0.5 h-4 w-px bg-hairline" />
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-accent transition-colors hover:bg-elevated"
        >
          <Sparkles className="size-3.5" />
          Ask AI
        </button>
      </div>
    </div>
  );
}
