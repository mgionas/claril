export type Pt = { x: number; y: number };
export type PinchStart = {
  startDist: number;
  startMid: Pt;
  startScale: number;
  lastMid: Pt;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Capture the reference frame when the second finger lands. */
export function beginPinch(a: Pt, b: Pt, startScale: number): PinchStart {
  const m = mid(a, b);
  return { startDist: dist(a, b) || 1, startMid: m, startScale, lastMid: m };
}

/** Compute the absolute zoom, the focal center, and the incremental pan. */
export function updatePinch(
  start: PinchStart,
  a: Pt,
  b: Pt,
): { scale: number; center: Pt; pan: { dx: number; dy: number } } {
  const m = mid(a, b);
  const ratio = dist(a, b) / start.startDist;
  const scale = clamp(start.startScale * ratio, MIN_ZOOM, MAX_ZOOM);
  const pan = { dx: m.x - start.lastMid.x, dy: m.y - start.lastMid.y };
  start.lastMid = m;
  return { scale, center: m, pan };
}
