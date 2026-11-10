export type BoardScene = {
  elements: unknown[];
  appState: { viewBackgroundColor: string };
  files: Record<string, unknown>;
};

const EMPTY: BoardScene = { elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} };

/** Serialize an Excalidraw scene to the stored JSON string. We persist `files`
 * ourselves because Excalidraw's own serializeAsJSON omits them. */
export function serializeBoard(
  elements: readonly unknown[],
  appState: { viewBackgroundColor?: string },
  files: Record<string, unknown>,
): string {
  return JSON.stringify({
    version: 1,
    source: "claril-board",
    elements,
    appState: { viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff" },
    files: files ?? {},
  });
}

/** Parse stored content back into Excalidraw initialData. Tolerant of empty or
 * malformed content (new boards / legacy rows) → empty scene. */
export function deserializeBoard(content: string): BoardScene {
  if (!content) return { ...EMPTY };
  try {
    const p = JSON.parse(content);
    return {
      elements: Array.isArray(p.elements) ? p.elements : [],
      appState: { viewBackgroundColor: p.appState?.viewBackgroundColor ?? "#ffffff" },
      files: p.files && typeof p.files === "object" ? p.files : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Excalidraw image-element skeleton for an embedded BPMN tile. Pass to
 * convertToExcalidrawElements(). Carries the ref link + customData. */
export function buildDiagramRefSkeleton(args: {
  fileId: string;
  diagramId: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    type: "image" as const,
    fileId: args.fileId,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    link: args.url,
    customData: { type: "diagram-ref", diagramId: args.diagramId },
  };
}

/** If an element is a diagram-ref tile, return its ids; else null. */
export function readDiagramRef(element: {
  customData?: { type?: string; diagramId?: string };
  fileId?: string;
}): { diagramId: string; fileId: string } | null {
  if (element.customData?.type === "diagram-ref" && element.customData.diagramId && element.fileId) {
    return { diagramId: element.customData.diagramId, fileId: element.fileId };
  }
  return null;
}
