"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const ORDER = ["light", "dark", "system"] as const;
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const LABEL = { light: "Light", dark: "Dark", system: "System" } as const;

/**
 * Cycles Light → Dark → System. Renders a stable placeholder until mounted to
 * avoid a hydration mismatch (theme is only known on the client).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const { theme = "system", setTheme } = useTheme();
  useEffect(() => setMounted(true), []);

  const current = (mounted ? theme : "system") as (typeof ORDER)[number];
  const Icon = ICON[current] ?? Monitor;

  return (
    <button
      type="button"
      aria-label={`Theme: ${LABEL[current]} (click to change)`}
      title={`Theme: ${LABEL[current]}`}
      onClick={() => {
        const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
        setTheme(next);
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-[10px] border border-hairline bg-panel/80 px-2 py-1.5 text-fg-muted backdrop-blur transition-colors hover:text-fg",
        className,
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}
