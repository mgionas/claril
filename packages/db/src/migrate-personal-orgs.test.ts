import { describe, expect, it } from "vitest";
import { qualifiesAsAutoPersonalOrg } from "./migrate-personal-orgs";

describe("qualifiesAsAutoPersonalOrg", () => {
  it("qualifies a single-owner org named Personal", () => {
    expect(qualifiesAsAutoPersonalOrg({ name: "Personal", members: [{ userId: "u1", role: "owner" }] })).toBe(true);
  });
  it("rejects multi-member orgs", () => {
    expect(qualifiesAsAutoPersonalOrg({ name: "Personal", members: [{ userId: "u1", role: "owner" }, { userId: "u2", role: "member" }] })).toBe(false);
  });
  it("rejects orgs not named Personal", () => {
    expect(qualifiesAsAutoPersonalOrg({ name: "Acme", members: [{ userId: "u1", role: "owner" }] })).toBe(false);
  });
  it("rejects a single-member org whose member isn't owner", () => {
    expect(qualifiesAsAutoPersonalOrg({ name: "Personal", members: [{ userId: "u1", role: "member" }] })).toBe(false);
  });
});
