import { layoutProcess } from "bpmn-auto-layout";
// bpmn-moddle ships no type declarations; mirror parse.ts and type its tiny
// surface locally rather than via an ambient module declaration.
import { BpmnModdle as BpmnModdleUntyped } from "bpmn-moddle";

/** A parsed/created moddle element. `$type` is the BPMN(DI) type name. */
interface Moddle {
  $type: string;
  id?: string;
  [key: string]: unknown;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ModdleInstance {
  fromXML(xml: string): Promise<{ rootElement: Moddle }>;
  toXML(element: Moddle, options?: { format?: boolean }): Promise<{ xml: string }>;
  create(type: string, props: Record<string, unknown>): Moddle;
}

interface ModdleCtor {
  new (): ModdleInstance;
}

const BpmnModdle = BpmnModdleUntyped as unknown as ModdleCtor;

// Pool geometry (CSS px in BPMN DI space). LABEL_BAND is the vertical name strip
// on the pool's left edge; PAD is the breathing room around the laid-out process.
const LABEL_BAND = 30;
const PAD = 30;
const POOL_GAP = 60;
const MIN_POOL_HEIGHT = 120;

const asArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value === undefined || value === null) return [];
  return [value as T];
};

const getBounds = (el: Moddle): Bounds | undefined => {
  const b = el.bounds as Partial<Bounds> | undefined;
  if (
    b &&
    typeof b.x === "number" &&
    typeof b.y === "number" &&
    typeof b.width === "number" &&
    typeof b.height === "number"
  ) {
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }
  return undefined;
};

/**
 * Index every element carrying a string `id` reachable from `root`, so a
 * laid-out shape (which references a clone in a second moddle instance) can be
 * mapped back to the ORIGINAL element in this document — keeping every DI
 * reference inside one moddle instance.
 */
function indexById(root: Moddle): Map<string, Moddle> {
  const map = new Map<string, Moddle>();
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const el = node as Moddle;
    if (typeof el.$type === "string" && typeof el.id === "string" && !map.has(el.id)) {
      map.set(el.id, el);
    }
    for (const [key, value] of Object.entries(el)) {
      if (key === "$parent" || key === "$type") continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && typeof (value as Moddle).$type === "string") {
        visit(value as Moddle);
      }
    }
  };
  visit(root);
  return map;
}

/** Lay out a single process and return its DI plane elements. */
async function layoutSingleProcess(
  moddle: ModdleInstance,
  process: Moddle,
): Promise<Moddle[]> {
  const standalone = moddle.create("bpmn:Definitions", {
    id: `SD_${process.id ?? "process"}`,
    targetNamespace: "http://bpmn.io/schema/bpmn",
    rootElements: [process],
  });
  const { xml } = await moddle.toXML(standalone);
  const laidXml = await layoutProcess(xml);
  // Parse the laid-out result in a throwaway instance — we only read geometry.
  const reader = new BpmnModdle();
  const { rootElement: laidDefs } = await reader.fromXML(laidXml);
  const diagram = asArray<Moddle>(laidDefs.diagrams)[0];
  const plane = diagram?.plane as Moddle | undefined;
  return asArray<Moddle>(plane?.planeElement);
}

/**
 * Lay out a BPMN collaboration that `bpmn-auto-layout` cannot
 * (`layoutProcess` lays out only the first participant and skips message
 * flows). Each participant's process is laid out independently via the upstream
 * engine; the pools are then stacked vertically with a left name-band and the
 * message flows are drawn as orthogonal edges between them.
 *
 * For a single process (no `<collaboration>` or one participant) this delegates
 * straight to `layoutProcess`, so non-pool diagrams are unaffected.
 *
 * Input is semantic BPMN 2.0 XML (no diagram interchange); output is the same
 * model with a `<bpmndi:BPMNDiagram>` added so it renders.
 */
export async function layoutCollaboration(xml: string): Promise<string> {
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(xml);

  const roots = asArray<Moddle>(defs.rootElements);
  const collaboration = roots.find((r) => r.$type === "bpmn:Collaboration");
  const participants = collaboration ? asArray<Moddle>(collaboration.participants) : [];

  // Single process / black-box collaboration → upstream engine handles it.
  if (!collaboration || participants.length <= 1) {
    return layoutProcess(xml);
  }

  const elementById = indexById(defs);
  const planeElements: Moddle[] = [];
  // id -> global bounds, for routing message flows after all pools are placed.
  const placedBounds = new Map<string, Bounds>();
  const poolShapes: Moddle[] = [];

  let cursorY = 0;
  let maxPoolWidth = 0;

  for (const participant of participants) {
    const process = participant.processRef as Moddle | undefined;
    const poolTop = cursorY;

    if (!process) {
      // Black-box pool: a fixed-size empty band.
      const bounds = moddle.create("dc:Bounds", {
        x: 0,
        y: poolTop,
        width: 600,
        height: MIN_POOL_HEIGHT,
      });
      const shape = moddle.create("bpmndi:BPMNShape", {
        id: `Shape_${participant.id}`,
        bpmnElement: participant,
        isHorizontal: true,
        bounds,
      });
      poolShapes.push(shape);
      planeElements.push(shape);
      maxPoolWidth = Math.max(maxPoolWidth, 600);
      cursorY = poolTop + MIN_POOL_HEIGHT + POOL_GAP;
      continue;
    }

    const laidElements = await layoutSingleProcess(moddle, process);
    const shapes = laidElements.filter((p) => p.$type === "bpmndi:BPMNShape" && getBounds(p));

    if (shapes.length === 0) {
      cursorY = poolTop + MIN_POOL_HEIGHT + POOL_GAP;
      continue;
    }

    // Content bbox in the process's local coordinate frame.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const shape of shapes) {
      const b = getBounds(shape)!;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Translate so content sits inside the pool body, right of the name-band.
    const dx = LABEL_BAND + PAD - minX;
    const dy = poolTop + PAD - minY;

    const poolHeight = Math.max(contentHeight + 2 * PAD, MIN_POOL_HEIGHT);
    const poolWidth = LABEL_BAND + PAD + contentWidth + PAD;
    maxPoolWidth = Math.max(maxPoolWidth, poolWidth);

    // Pool shape first so bpmn-js resolves children's parent on import.
    const poolBounds = moddle.create("dc:Bounds", {
      x: 0,
      y: poolTop,
      width: poolWidth,
      height: poolHeight,
    });
    const poolShape = moddle.create("bpmndi:BPMNShape", {
      id: `Shape_${participant.id}`,
      bpmnElement: participant,
      isHorizontal: true,
      bounds: poolBounds,
    });
    poolShapes.push(poolShape);
    planeElements.push(poolShape);

    // Translated child shapes + edges, referencing the ORIGINAL elements.
    for (const pe of laidElements) {
      const refId = (pe.bpmnElement as Moddle | undefined)?.id;
      if (!refId) continue;
      const original = elementById.get(refId);
      if (!original) continue;

      if (pe.$type === "bpmndi:BPMNShape") {
        const b = getBounds(pe);
        if (!b) continue;
        const gx = b.x + dx;
        const gy = b.y + dy;
        const bounds = moddle.create("dc:Bounds", {
          x: gx,
          y: gy,
          width: b.width,
          height: b.height,
        });
        planeElements.push(
          moddle.create("bpmndi:BPMNShape", {
            id: `Shape_${refId}`,
            bpmnElement: original,
            bounds,
          }),
        );
        placedBounds.set(refId, { x: gx, y: gy, width: b.width, height: b.height });
      } else if (pe.$type === "bpmndi:BPMNEdge") {
        const waypoints = asArray<{ x: number; y: number }>(pe.waypoint).map((w) =>
          moddle.create("dc:Point", { x: w.x + dx, y: w.y + dy }),
        );
        if (waypoints.length < 2) continue;
        planeElements.push(
          moddle.create("bpmndi:BPMNEdge", {
            id: `Edge_${refId}`,
            bpmnElement: original,
            waypoint: waypoints,
          }),
        );
      }
    }

    cursorY = poolTop + poolHeight + POOL_GAP;
  }

  // Align all pools to the widest so they stack like standard bpmn.io pools.
  for (const shape of poolShapes) {
    const b = shape.bounds as Bounds;
    if (b && typeof b.width === "number") b.width = maxPoolWidth;
  }

  // Message flows: orthogonal vertical edges between the placed shapes.
  for (const messageFlow of asArray<Moddle>(collaboration.messageFlows)) {
    const sourceId = (messageFlow.sourceRef as Moddle | undefined)?.id;
    const targetId = (messageFlow.targetRef as Moddle | undefined)?.id;
    if (!sourceId || !targetId) continue;
    const src = placedBounds.get(sourceId);
    const tgt = placedBounds.get(targetId);
    if (!src || !tgt) continue;

    const srcCenterY = src.y + src.height / 2;
    const tgtCenterY = tgt.y + tgt.height / 2;
    const srcX = src.x + src.width / 2;
    const tgtX = tgt.x + tgt.width / 2;

    // Exit the side of the source facing the target; enter the facing side of
    // the target.
    const start =
      srcCenterY <= tgtCenterY
        ? { x: srcX, y: src.y + src.height }
        : { x: srcX, y: src.y };
    const end =
      srcCenterY <= tgtCenterY ? { x: tgtX, y: tgt.y } : { x: tgtX, y: tgt.y + tgt.height };

    const points =
      Math.abs(start.x - end.x) < 1
        ? [start, end]
        : [
            start,
            { x: start.x, y: (start.y + end.y) / 2 },
            { x: end.x, y: (start.y + end.y) / 2 },
            end,
          ];

    planeElements.push(
      moddle.create("bpmndi:BPMNEdge", {
        id: `Edge_${messageFlow.id}`,
        bpmnElement: messageFlow,
        waypoint: points.map((p) => moddle.create("dc:Point", p)),
      }),
    );
  }

  const plane = moddle.create("bpmndi:BPMNPlane", {
    id: "BPMNPlane_1",
    bpmnElement: collaboration,
    planeElement: planeElements,
  });
  const diagram = moddle.create("bpmndi:BPMNDiagram", {
    id: "BPMNDiagram_1",
    plane,
  });
  defs.diagrams = [diagram];

  const { xml: out } = await moddle.toXML(defs, { format: true });
  return out;
}
