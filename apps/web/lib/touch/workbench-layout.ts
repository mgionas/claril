export type Layout = "wide" | "narrow";

const NARROW_MAX = 900;

/** Floating panels dock on `wide`; they become dismissible sheets on `narrow`
 * (portrait, or any viewport under NARROW_MAX). Pure + testable. */
export function resolveLayout(input: {
  width: number;
  orientation: "portrait" | "landscape";
}): Layout {
  if (input.orientation === "portrait") return "narrow";
  return input.width < NARROW_MAX ? "narrow" : "wide";
}
