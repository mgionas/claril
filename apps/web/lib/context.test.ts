import { describe, expect, it } from "vitest";
import { resolveActiveContext } from "./context";

describe("resolveActiveContext", () => {
  const uid = "u1";
  it("falls back to personal when no active org is set", () => {
    expect(resolveActiveContext(uid, null, ["o1"])).toEqual({ kind: "personal", userId: uid });
  });
  it("uses the active org when the user is a member", () => {
    expect(resolveActiveContext(uid, "o1", ["o1", "o2"])).toEqual({ kind: "org", orgId: "o1" });
  });
  it("falls back to personal when the active org is no longer a membership", () => {
    expect(resolveActiveContext(uid, "gone", ["o1"])).toEqual({ kind: "personal", userId: uid });
  });
});
