"use client";
import { useEffect, useState } from "react";
import { resolveLayout, type Layout } from "@/lib/touch/workbench-layout";

export function useWorkbenchLayout(): Layout {
  const [layout, setLayout] = useState<Layout>("wide");
  useEffect(() => {
    const apply = () =>
      setLayout(
        resolveLayout({
          width: window.innerWidth,
          orientation: window.matchMedia("(orientation: portrait)").matches
            ? "portrait"
            : "landscape",
        }),
      );
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
  return layout;
}
