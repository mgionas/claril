import { beginPinch, updatePinch, type Pt, type PinchStart } from "./gesture-math";

interface CanvasLike {
  getContainer(): HTMLElement;
  zoom(scale?: number, center?: Pt): number;
  scroll(delta: { dx: number; dy: number }): void;
}

interface EventBusLike {
  on(event: string, callback: () => void): void;
}

/**
 * diagram-js module: translates TWO-finger gestures into canvas zoom/scroll.
 * Single-finger touches are left untouched so diagram-js keeps doing
 * tap-select, drag-empty-to-pan, and drag-element-to-move. Requires
 * `touch-action: none` on `.djs-container` (set in globals.css under coarse).
 *
 * Listeners are torn down on diagram-js's `diagram.destroy` event. Without
 * this, `bpmn-canvas.tsx` recreating the BpmnModeler on the same persistent
 * container DOM node (diagram switch, or React StrictMode double-mount)
 * would stack a fresh set of listeners on top of orphaned ones whose
 * closures still reference the destroyed modeler's canvas.
 */
export class TouchGestures {
  static $inject = ["eventBus", "canvas"];
  private pinch: PinchStart | null = null;
  private readonly el: HTMLElement;
  private readonly onStart: (e: TouchEvent) => void;
  private readonly onMove: (e: TouchEvent) => void;
  private readonly onEnd: (e: TouchEvent) => void;

  constructor(eventBus: EventBusLike, canvas: CanvasLike) {
    const el = canvas.getContainer();
    this.el = el;
    const rel = (t: Touch): Pt => {
      const r = el.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    this.onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      this.pinch = beginPinch(rel(e.touches[0]), rel(e.touches[1]), canvas.zoom() || 1);
    };
    this.onMove = (e: TouchEvent) => {
      if (!this.pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const u = updatePinch(this.pinch, rel(e.touches[0]), rel(e.touches[1]));
      canvas.zoom(u.scale, u.center);
      if (u.pan.dx || u.pan.dy) canvas.scroll({ dx: u.pan.dx, dy: u.pan.dy });
    };
    this.onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) this.pinch = null;
    };
    el.addEventListener("touchstart", this.onStart, { passive: false });
    el.addEventListener("touchmove", this.onMove, { passive: false });
    el.addEventListener("touchend", this.onEnd);
    el.addEventListener("touchcancel", this.onEnd);

    eventBus.on("diagram.destroy", () => this.teardown());
  }

  private teardown(): void {
    this.el.removeEventListener("touchstart", this.onStart);
    this.el.removeEventListener("touchmove", this.onMove);
    this.el.removeEventListener("touchend", this.onEnd);
    this.el.removeEventListener("touchcancel", this.onEnd);
  }
}

const touchGesturesModule = {
  __init__: ["touchGestures"],
  touchGestures: ["type", TouchGestures],
};
export default touchGesturesModule;
