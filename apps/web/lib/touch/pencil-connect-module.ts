import { classifyPointer } from "./pointer";

interface ElementLike {
  id: string;
  waypoints?: unknown[];
}

/** Pure decision: a pen press on a plain shape starts a connection; finger and
 * mouse do not (finger = arrange/select; mouse = existing desktop context pad). */
export function shouldStartConnect(pointerType: string, element: ElementLike): boolean {
  if (classifyPointer(pointerType) !== "pen") return false;
  if (element.waypoints) return false; // it's a connection, not a node
  return true;
}

interface DiagramEvent {
  element: ElementLike;
  originalEvent?: Event & { pointerType?: string };
}
interface EventBusLike {
  on: (event: string, callback: (e: DiagramEvent) => void) => void;
}
interface ConnectLike {
  start: (event: Event, element: ElementLike) => void;
}

/**
 * diagram-js module: route an Apple Pencil press on a node straight into the
 * connect service (draw-to-connect). bpmn-js's `connect` service enforces the
 * BPMN rules itself (sequence flow within a pool, message flow across pools),
 * so none of that logic is reimplemented here — this module only decides
 * *whether* to call `connect.start`.
 *
 * Verified API: diagram-js emits `element.mousedown` (there is no
 * `element.pointerdown`); the event tuple carries the raw DOM event as
 * `originalEvent`. On iPad Safari that raw event is a PointerEvent with
 * `pointerType` set ("pen" | "touch" | "mouse"), but some code paths can
 * compat-dispatch a plain MouseEvent with no `pointerType` at all —
 * `classifyPointer` treats that as "mouse", so `shouldStartConnect` simply
 * never fires. That is intentional: this module is a guarded accelerator
 * only for a genuine pen signal, not a required path (finger users get the
 * same outcome via the selection toolbar's "connect" action). Real-device
 * firing is verified in Task 13.
 */
export class PencilConnect {
  static $inject = ["eventBus", "connect"];
  constructor(eventBus: EventBusLike, connect: ConnectLike) {
    eventBus.on("element.mousedown", (e) => {
      const original = e.originalEvent;
      if (!original) return;
      if (!shouldStartConnect(original.pointerType ?? "mouse", e.element)) return;
      connect.start(original, e.element);
    });
  }
}

const pencilConnectModule = {
  __init__: ["pencilConnect"],
  pencilConnect: ["type", PencilConnect],
};
export default pencilConnectModule;
