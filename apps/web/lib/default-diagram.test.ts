import { describe, expect, it } from "vitest";
import { seedForKind, defaultNameForKind, defaultBoardDiagram } from "./default-diagram";

describe("board kind", () => {
  it("seeds an empty Excalidraw scene for board", () => {
    expect(seedForKind("board")).toBe(defaultBoardDiagram);
    const parsed = JSON.parse(seedForKind("board"));
    expect(parsed.elements).toEqual([]);
    expect(parsed.version).toBe(1);
  });
  it("names a new board", () => {
    expect(defaultNameForKind("board")).toBe("Untitled board");
  });
});
