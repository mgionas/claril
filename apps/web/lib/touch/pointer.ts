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

/** Palm rejection: a finger touch landing within `windowMs` of the last pen
 * activity is treated as an accidental palm contact and ignored. Pure. */
export function shouldRejectPalm(
  kind: "pen" | "finger" | "mouse",
  lastPenActivityMs: number,
  nowMs: number,
  windowMs = 700,
): boolean {
  return kind === "finger" && lastPenActivityMs > 0 && nowMs - lastPenActivityMs < windowMs;
}
