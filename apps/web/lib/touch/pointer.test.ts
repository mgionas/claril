import { describe, expect, it } from "vitest";
import { classifyPointer, isCoarsePointer } from "./pointer";

describe("pointer", () => {
  it("reads coarse from a matchMedia result", () => {
    expect(isCoarsePointer({ matches: true })).toBe(true);
    expect(isCoarsePointer({ matches: false })).toBe(false);
  });
  it("classifies pointerType", () => {
    expect(classifyPointer("pen")).toBe("pen");
    expect(classifyPointer("touch")).toBe("finger");
    expect(classifyPointer("mouse")).toBe("mouse");
    expect(classifyPointer("")).toBe("mouse"); // unknown → mouse (safe default)
  });
});
