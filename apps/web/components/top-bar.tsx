"use client";

import { LogOut, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export type SaveState = "saved" | "saving" | "error";

const saveLabel: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  error: "Save failed",
};

interface TopBarProps {
  diagramName: string;
  userName: string;
  saveState: SaveState;
}

export function TopBar({ diagramName, userName, saveState }: TopBarProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-[10px] border border-hairline bg-panel/80 px-3 py-1.5 backdrop-blur">
        <span className="size-2 rounded-full bg-accent" />
        <span className="text-sm font-medium">Claril</span>
        <span className="text-fg-subtle">/</span>
        <span className="text-sm text-fg-muted">{diagramName}</span>
        <span className="text-fg-subtle">·</span>
        <span className="text-xs text-fg-subtle">{saveLabel[saveState]}</span>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-3 py-1.5 backdrop-blur"
          title="No AI provider configured — everything deterministic still works."
        >
          <Sparkles className="size-3.5 text-fg-subtle" />
          <span className="text-xs text-fg-muted">AI: off</span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title={`Sign out (${userName})`}
          className="flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-3 py-1.5 text-fg-muted backdrop-blur transition-colors hover:text-fg"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    </header>
  );
}
