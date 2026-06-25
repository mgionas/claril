"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { SettingsCard, SettingsHeader } from "./settings-ui";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/** Theme picker (Light / Dark / System) for the profile settings page. */
export function AppearanceForm() {
  const [mounted, setMounted] = useState(false);
  const { theme = "system", setTheme } = useTheme();
  useEffect(() => setMounted(true), []);
  const active = mounted ? theme : undefined;

  return (
    <SettingsCard className="mt-6">
      <SettingsHeader title="Appearance" description="Choose how Claril looks. System follows your device setting." />
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {OPTIONS.map(({ value, label, Icon }) => {
          const selected = active === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-[8px] border px-3 py-3 text-sm transition-colors",
                selected
                  ? "border-accent/40 bg-accent/10 text-fg"
                  : "border-hairline bg-elevated/40 text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}
