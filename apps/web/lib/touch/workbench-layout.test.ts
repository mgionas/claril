import { describe, expect, it } from "vitest";
import { resolveLayout } from "./workbench-layout";

describe("resolveLayout", () => {
  it("iPad landscape (1024, landscape) is wide", () => {
    expect(resolveLayout({ width: 1024, orientation: "landscape" })).toBe("wide");
  });
  it("iPad portrait (768, portrait) is narrow", () => {
    expect(resolveLayout({ width: 768, orientation: "portrait" })).toBe("narrow");
  });
  it("a narrow landscape window (<900) is narrow", () => {
    expect(resolveLayout({ width: 820, orientation: "landscape" })).toBe("narrow");
  });
  it("a wide desktop is wide", () => {
    expect(resolveLayout({ width: 1600, orientation: "landscape" })).toBe("wide");
  });
});
