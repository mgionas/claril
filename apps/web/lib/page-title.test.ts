import { describe, expect, it } from "vitest";
import { titleForPath } from "@/lib/page-title";

describe("titleForPath", () => {
  it.each([
    ["/", "Dashboard"],
    ["/projects", "Projects"],
    ["/workspaces", "Workspaces"],
    ["/w/abc123", "Workspace"],
    ["/catalog", "Catalog"],
    ["/catalog/asset_1", "Catalog"],
    ["/settings", "Settings"],
    ["/settings/ai", "Settings"],
    ["/something-else", ""],
  ])("%s → %s", (path, title) => {
    expect(titleForPath(path)).toBe(title);
  });

  it("does not match prefixes that are not path segments", () => {
    expect(titleForPath("/projectsx")).toBe("");
    expect(titleForPath("/catalogue")).toBe("");
  });
});
