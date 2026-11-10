"use client";

import { useCallback, useEffect, useState } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { Network, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildDiagramRefSkeleton, deserializeBoard, readDiagramRef, serializeBoard } from "@/lib/board-scene";
import { getDiagramContentForEmbed, getEmbeddableDiagrams, type EmbeddableDiagram } from "@/lib/board-actions";
import { renderBpmnToDataUrl } from "@/lib/board-svg";
import { RelatedPanel } from "@/components/related-panel";

export interface BoardCanvasProps {
  /** The board diagram's own id, used to scope the embed picker and to
   * access-gate the server actions it calls. */
  diagramId: string;
  initialContent: string;
  onChange: (content: string) => void;
}

/**
 * Minimal Excalidraw mount for Board diagrams. Client-only (dynamically
 * imported from BoardWorkbench) since Excalidraw touches the DOM/canvas APIs.
 * Scene (de)serialization is delegated to the pure helpers in
 * `@/lib/board-scene` so the stored JSON shape has a single source of truth.
 *
 * Also hosts the "Embed diagram" flow: pick a BPMN diagram from the same
 * project, render it headlessly to an SVG tile, and drop it on the canvas as
 * a linked image element carrying a diagram-ref in its customData. On mount,
 * every diagram-ref tile already on the board is refreshed from the live
 * BPMN content so edits elsewhere show up when the board is reopened.
 */
export default function BoardCanvas({ diagramId, initialContent, onChange }: BoardCanvasProps) {
  const initial = deserializeBoard(initialContent);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [embeddable, setEmbeddable] = useState<EmbeddableDiagram[] | null>(null);
  const [inserting, setInserting] = useState(false);
  // The diagram-ref of the single currently-selected tile, if any — drives
  // the floating "Related" button. `relatedFor` is the diagram id the
  // RelatedPanel is open for (set when the button is clicked).
  const [selectedRef, setSelectedRef] = useState<{ diagramId: string } | null>(null);
  const [relatedFor, setRelatedFor] = useState<string | null>(null);

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      onChange(
        serializeBoard(
          elements,
          appState as { viewBackgroundColor?: string },
          files as Record<string, unknown>,
        ),
      );

      const selectedElementIds = (appState as { selectedElementIds?: Record<string, boolean> })
        .selectedElementIds;
      const selectedIds = selectedElementIds ? Object.keys(selectedElementIds).filter((id) => selectedElementIds[id]) : [];
      if (selectedIds.length === 1) {
        const el = (elements as { id?: string }[]).find((e) => e.id === selectedIds[0]);
        const ref = el ? readDiagramRef(el as never) : null;
        setSelectedRef(ref ? { diagramId: ref.diagramId } : null);
      } else {
        setSelectedRef(null);
      }
    },
    [onChange],
  );

  // Lazily load the picker's options the first time it's opened.
  const openPicker = useCallback(
    (open: boolean) => {
      setPickerOpen(open);
      if (open && embeddable === null) {
        getEmbeddableDiagrams(diagramId)
          .then(setEmbeddable)
          .catch(() => setEmbeddable([]));
      }
    },
    [diagramId, embeddable],
  );

  const insertEmbed = useCallback(
    async (targetDiagramId: string) => {
      if (!api) return;
      setInserting(true);
      try {
        const { content } = await getDiagramContentForEmbed(targetDiagramId);
        const dataURL = await renderBpmnToDataUrl(content);
        const fileId = `bpmn-${crypto.randomUUID()}`;
        api.addFiles([
          { id: fileId as never, dataURL: dataURL as never, mimeType: "image/svg+xml", created: Date.now() },
        ]);
        const [el] = convertToExcalidrawElements([
          buildDiagramRefSkeleton({
            fileId,
            diagramId: targetDiagramId,
            url: `/d/${targetDiagramId}`,
            x: 120,
            y: 120,
            width: 800,
            height: 600,
          }) as never,
        ]);
        api.updateScene({ elements: [...api.getSceneElements(), el] });
        setPickerOpen(false);
      } finally {
        setInserting(false);
      }
    },
    [api],
  );

  // Refresh every diagram-ref tile from its current BPMN content when the
  // board mounts, so edits made elsewhere are visible on reopen. A ref whose
  // target diagram was deleted or is no longer accessible just keeps its
  // stale tile (best-effort, per-ref).
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    (async () => {
      const refs = api
        .getSceneElements()
        .map((e) => readDiagramRef(e as never))
        .filter((r): r is { diagramId: string; fileId: string } => r !== null);
      for (const ref of refs) {
        if (cancelled) return;
        try {
          const { content } = await getDiagramContentForEmbed(ref.diagramId);
          const dataURL = await renderBpmnToDataUrl(content);
          if (cancelled) return;
          api.addFiles([
            { id: ref.fileId as never, dataURL: dataURL as never, mimeType: "image/svg+xml", created: Date.now() },
          ]);
        } catch {
          /* diagram deleted/inaccessible — leave the stale tile */
        }
      }
      if (!cancelled) api.updateScene({ elements: api.getSceneElements() }); // force re-render of refreshed files
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <div className="relative h-full w-full">
      <Excalidraw
        excalidrawAPI={(a) => setApi(a)}
        initialData={
          { elements: initial.elements, appState: initial.appState, files: initial.files } as unknown as ExcalidrawInitialDataState
        }
        onChange={handleChange}
      />
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {selectedRef && (
          <Button variant="outline" size="sm" onClick={() => setRelatedFor(selectedRef.diagramId)}>
            <Network />
            Related
          </Button>
        )}
        <Popover open={pickerOpen} onOpenChange={openPicker}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={!api}>
              <Shapes />
              Embed diagram
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Find a BPMN diagram…" />
              <CommandList>
                {embeddable === null ? (
                  <CommandEmpty>Loading…</CommandEmpty>
                ) : embeddable.length === 0 ? (
                  <CommandEmpty>No BPMN diagrams in this project.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {embeddable.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={d.name}
                        disabled={inserting}
                        onSelect={() => insertEmbed(d.id)}
                      >
                        {d.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {relatedFor && <RelatedPanel diagramId={relatedFor} onClose={() => setRelatedFor(null)} />}
    </div>
  );
}
