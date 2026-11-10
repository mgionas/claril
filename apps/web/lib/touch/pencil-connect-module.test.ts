import { describe, expect, it } from "vitest";
import { shouldStartConnect } from "./pencil-connect-module";

const shape = { id: "T1", waypoints: undefined };
const connection = { id: "F1", waypoints: [{ x: 0, y: 0 }] };

describe("shouldStartConnect", () => {
  it("pen on a shape → connect", () => {
    expect(shouldStartConnect("pen", shape)).toBe(true);
  });
  it("finger on a shape → no (finger moves/pans)", () => {
    expect(shouldStartConnect("touch", shape)).toBe(false);
  });
  it("pen on a connection → no (can't start a flow from a flow)", () => {
    expect(shouldStartConnect("pen", connection)).toBe(false);
  });
  it("mouse → no (desktop unchanged, uses the normal context pad)", () => {
    expect(shouldStartConnect("mouse", shape)).toBe(false);
  });
});
