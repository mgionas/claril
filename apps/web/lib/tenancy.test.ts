import { describe, expect, it } from "vitest";
import { diagramParent } from "./tenancy";

describe("diagramParent", () => {
  it("resolves an org-project parent", () => {
    expect(diagramParent({ projectId: "p1", personalProjectId: null })).toEqual({
      kind: "org",
      projectId: "p1",
    });
  });
  it("resolves a personal-project parent", () => {
    expect(diagramParent({ projectId: null, personalProjectId: "pp1" })).toEqual({
      kind: "personal",
      personalProjectId: "pp1",
    });
  });
  it("throws when neither parent is set", () => {
    expect(() => diagramParent({ projectId: null, personalProjectId: null })).toThrow();
  });
  it("throws when both parents are set", () => {
    expect(() => diagramParent({ projectId: "p1", personalProjectId: "pp1" })).toThrow();
  });
});
