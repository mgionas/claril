"use client";

import { useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { deserializeBoard, serializeBoard } from "@/lib/board-scene";

export interface BoardCanvasProps {
  initialContent: string;
  onChange: (content: string) => void;
}

/**
 * Minimal Excalidraw mount for Board diagrams. Client-only (dynamically
 * imported from BoardWorkbench) since Excalidraw touches the DOM/canvas APIs.
 * Scene (de)serialization is delegated to the pure helpers in
 * `@/lib/board-scene` so the stored JSON shape has a single source of truth.
 */
export default function BoardCanvas({ initialContent, onChange }: BoardCanvasProps) {
  const initial = deserializeBoard(initialContent);

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      onChange(
        serializeBoard(
          elements,
          appState as { viewBackgroundColor?: string },
          files as Record<string, unknown>,
        ),
      );
    },
    [onChange],
  );

  return (
    <div className="h-full w-full">
      <Excalidraw
        initialData={
          { elements: initial.elements, appState: initial.appState, files: initial.files } as never
        }
        onChange={handleChange as never}
      />
    </div>
  );
}
