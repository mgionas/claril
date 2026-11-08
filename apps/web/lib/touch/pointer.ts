/** True when the primary input is coarse (touch). Pass a MediaQueryList (or a
 * `{matches}` stub in tests); defaults to the live `(pointer: coarse)` query. */
export function isCoarsePointer(
  mql: { matches: boolean } = typeof window !== "undefined"
    ? window.matchMedia("(pointer: coarse)")
    : { matches: false },
): boolean {
  return mql.matches;
}

/** Normalize a PointerEvent.pointerType to the three instruments we care about. */
export function classifyPointer(pointerType: string): "pen" | "finger" | "mouse" {
  if (pointerType === "pen") return "pen";
  if (pointerType === "touch") return "finger";
  return "mouse";
}
