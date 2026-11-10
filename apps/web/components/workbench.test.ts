import { describe, expect, it } from "vitest";
import { seedForKind, defaultNameForKind, type DiagramKind } from "@/lib/default-diagram";

describe("diagram kinds remain intact (dispatch guard)", () => {
  it("every kind has a seed + name, board included, others unchanged", () => {
    const kinds: DiagramKind[] = ["bpmn", "sequence", "c4", "board"];
    for (const k of kinds) {
      expect(typeof seedForKind(k)).toBe("string");
      expect(seedForKind(k).length).toBeGreaterThan(0);
      expect(defaultNameForKind(k)).toMatch(/\w/);
    }
    expect(defaultNameForKind("bpmn")).toBe("Untitled process");
    expect(defaultNameForKind("board")).toBe("Untitled board");
    expect(() => JSON.parse(seedForKind("board"))).not.toThrow();
  });
});
