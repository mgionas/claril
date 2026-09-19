"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** App-wide toaster, following the active light/dark theme and design tokens. */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "light" || resolvedTheme === "dark" ? resolvedTheme : "system"}
      position="bottom-right"
      closeButton
      style={
        {
          "--normal-bg": "var(--color-elevated)",
          "--normal-text": "var(--color-fg)",
          "--normal-border": "var(--color-hairline)",
        } as CSSProperties
      }
      {...props}
    />
  );
}
