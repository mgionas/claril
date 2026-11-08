"use client";
import { useEffect, useState } from "react";

/**
 * Reactive coarse-pointer detection. Returns whether the primary input is
 * touch, updating if the device changes (e.g. iPad keyboard attach/detach).
 * Side effect: stamps `data-coarse` on <html> so CSS (the `coarse:` variant)
 * can branch without JS per component.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    const apply = () => {
      setCoarse(mql.matches);
      document.documentElement.dataset.coarse = mql.matches ? "true" : "";
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return coarse;
}
