import { describe, expect, it } from "vitest";
import { canDo, diagramParent } from "./tenancy";

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

describe("canDo (workspace roles)", () => {
  it("viewer can only view", () => {
    expect(canDo("viewer", "view")).toBe(true);
    expect(canDo("viewer", "edit")).toBe(false);
    expect(canDo("viewer", "manage")).toBe(false);
  });
  it("editor (and legacy member) can view + edit, not manage", () => {
    for (const r of ["editor", "member"] as const) {
      expect(canDo(r, "view")).toBe(true);
      expect(canDo(r, "edit")).toBe(true);
      expect(canDo(r, "manage")).toBe(false);
    }
  });
  it("admin can do everything", () => {
    expect(canDo("admin", "view") && canDo("admin", "edit") && canDo("admin", "manage")).toBe(true);
  });
});
