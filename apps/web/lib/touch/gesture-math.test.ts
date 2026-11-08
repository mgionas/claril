import { describe, expect, it } from "vitest";
import { beginPinch, updatePinch } from "./gesture-math";

describe("gesture-math", () => {
  it("doubling finger distance doubles the scale around the midpoint", () => {
    const start = beginPinch({ x: 0, y: 0 }, { x: 100, y: 0 }, 1); // dist 100, mid (50,0)
    const u = updatePinch(start, { x: -50, y: 0 }, { x: 150, y: 0 }); // dist 200, mid (50,0)
    expect(u.scale).toBeCloseTo(2);
    expect(u.center).toEqual({ x: 50, y: 0 });
    expect(u.pan).toEqual({ dx: 0, dy: 0 }); // midpoint didn't move
  });

  it("translating both fingers produces pan with no scale change", () => {
    const start = beginPinch({ x: 0, y: 0 }, { x: 100, y: 0 }, 1); // mid (50,0)
    const u = updatePinch(start, { x: 10, y: 20 }, { x: 110, y: 20 }); // dist 100, mid (60,20)
    expect(u.scale).toBeCloseTo(1);
    expect(u.pan).toEqual({ dx: 10, dy: 20 });
  });

  it("clamps scale to a sane range", () => {
    const start = beginPinch({ x: 0, y: 0 }, { x: 1, y: 0 }, 1); // tiny start dist
    const u = updatePinch(start, { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(u.scale).toBeLessThanOrEqual(5);
  });
});
