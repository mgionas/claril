import { describe, expect, it } from "vitest";
import { serializeBoard, deserializeBoard, buildDiagramRefSkeleton, readDiagramRef } from "./board-scene";

describe("board-scene", () => {
  it("round-trips elements/appState/files", () => {
    const s = serializeBoard([{ id: "a" }], { viewBackgroundColor: "#eee" }, { f1: { id: "f1" } });
    const d = deserializeBoard(s);
    expect(d.elements).toEqual([{ id: "a" }]);
    expect(d.appState.viewBackgroundColor).toBe("#eee");
    expect(d.files).toEqual({ f1: { id: "f1" } });
  });
  it("tolerates empty/invalid content → empty scene", () => {
    expect(deserializeBoard("").elements).toEqual([]);
    expect(deserializeBoard("not json").elements).toEqual([]);
    expect(deserializeBoard("").appState.viewBackgroundColor).toBe("#ffffff");
  });
  it("builds a diagram-ref image skeleton and reads it back", () => {
    const sk = buildDiagramRefSkeleton({ fileId: "f1", diagramId: "D1", url: "/d/D1", x: 10, y: 20, width: 800, height: 600 }) as {
      type: string; fileId: string; link: string; customData: { type: string; diagramId: string };
    };
    expect(sk.type).toBe("image");
    expect(sk.fileId).toBe("f1");
    expect(sk.link).toBe("/d/D1");
    expect(sk.customData).toEqual({ type: "diagram-ref", diagramId: "D1" });
    expect(readDiagramRef({ customData: sk.customData, fileId: "f1" })).toEqual({ diagramId: "D1", fileId: "f1" });
  });
  it("readDiagramRef ignores non-ref elements", () => {
    expect(readDiagramRef({ customData: { type: "other" }, fileId: "x" })).toBeNull();
    expect(readDiagramRef({})).toBeNull();
  });
});
