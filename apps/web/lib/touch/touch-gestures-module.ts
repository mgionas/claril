import { beginPinch, updatePinch, type Pt, type PinchStart } from "./gesture-math";

interface CanvasLike {
  getContainer(): HTMLElement;
  zoom(scale?: number, center?: Pt): number;
  scroll(delta: { dx: number; dy: number }): void;
}

/**
 * diagram-js module: translates TWO-finger gestures into canvas zoom/scroll.
 * Single-finger touches are left untouched so diagram-js keeps doing
 * tap-select, drag-empty-to-pan, and drag-element-to-move. Requires
 * `touch-action: none` on `.djs-container` (set in globals.css under coarse).
 */
export class TouchGestures {
  static $inject = ["canvas"];
  private pinch: PinchStart | null = null;

  constructor(canvas: CanvasLike) {
    const el = canvas.getContainer();
    const rel = (t: Touch): Pt => {
      const r = el.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      this.pinch = beginPinch(rel(e.touches[0]), rel(e.touches[1]), canvas.zoom() || 1);
    };
    const move = (e: TouchEvent) => {
      if (!this.pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const u = updatePinch(this.pinch, rel(e.touches[0]), rel(e.touches[1]));
      canvas.zoom(u.scale, u.center);
      if (u.pan.dx || u.pan.dy) canvas.scroll({ dx: u.pan.dx, dy: u.pan.dy });
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) this.pinch = null;
    };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  }
}

const touchGesturesModule = {
  __init__: ["touchGestures"],
  touchGestures: ["type", TouchGestures],
};
export default touchGesturesModule;
