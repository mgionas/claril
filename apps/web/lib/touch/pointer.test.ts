import { describe, expect, it } from "vitest";
import { classifyPointer, isCoarsePointer, shouldRejectPalm } from "./pointer";

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

describe("shouldRejectPalm", () => {
  it("rejects a finger touch within the pen-activity window", () => {
    expect(shouldRejectPalm("finger", 1000, 1500, 700)).toBe(true);
  });
  it("allows a finger touch outside the pen-activity window", () => {
    expect(shouldRejectPalm("finger", 1000, 1701, 700)).toBe(false);
  });
  it("allows a finger touch when there has been no pen activity yet", () => {
    expect(shouldRejectPalm("finger", 0, 1500, 700)).toBe(false);
  });
  it("never rejects pen input", () => {
    expect(shouldRejectPalm("pen", 1000, 1500, 700)).toBe(false);
  });
  it("never rejects mouse input", () => {
    expect(shouldRejectPalm("mouse", 1000, 1500, 700)).toBe(false);
  });
});
