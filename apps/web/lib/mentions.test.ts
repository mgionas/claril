import { describe, it, expect } from "vitest";
import { parseMentions, notifyTargets } from "./mentions";

const cands = [
  { id: "u1", name: "Ada Lovelace" },
  { id: "u2", name: "Alan Turing" },
  { id: "u3", name: "Grace Hopper" },
];

describe("parseMentions", () => {
  it("resolves @Name tokens to ids", () => {
    expect(parseMentions("hey @Ada Lovelace look", cands)).toEqual(["u1"]);
  });
  it("matches multiple and dedupes", () => {
    expect(parseMentions("@Alan Turing @Grace Hopper @Alan Turing", cands).sort()).toEqual(["u2", "u3"]);
  });
  it("ignores unknown names", () => {
    expect(parseMentions("@Nobody Here hi", cands)).toEqual([]);
  });
  it("returns [] when no mentions", () => {
    expect(parseMentions("plain text", cands)).toEqual([]);
  });
  it("longest name wins — does not also fire a prefix candidate", () => {
    const overlap = [
      { id: "short", name: "Ada" },
      { id: "long", name: "Ada Lovelace" },
    ];
    expect(parseMentions("hi @Ada Lovelace", overlap)).toEqual(["long"]);
  });
  it("matches a prefix name when the longer one is absent from the text", () => {
    const overlap = [
      { id: "short", name: "Ada" },
      { id: "long", name: "Ada Lovelace" },
    ];
    expect(parseMentions("hi @Ada there", overlap)).toEqual(["short"]);
  });
  it("requires a trailing word boundary — @Annabel does not mention Ann", () => {
    expect(parseMentions("hi @Annabel rocks", [{ id: "ann", name: "Ann" }])).toEqual([]);
  });
  it("ignores a mid-word @ such as an email address", () => {
    expect(parseMentions("ping a@Alan Turing.io", [{ id: "al", name: "Alan Turing" }])).toEqual([]);
  });
  it("matches a name at the very end of the string", () => {
    expect(parseMentions("thanks @Grace Hopper", cands)).toEqual(["u3"]);
  });
});

describe("notifyTargets", () => {
  it("splits mention vs reply and excludes the actor", () => {
    const r = notifyTargets({ actorId: "u1", mentionedUserIds: ["u2"], participantIds: ["u1", "u3"] });
    expect(r.mention).toEqual(["u2"]);
    expect(r.reply).toEqual(["u3"]);
  });
  it("a mentioned participant counts as mention only", () => {
    const r = notifyTargets({ actorId: "u1", mentionedUserIds: ["u3"], participantIds: ["u1", "u3"] });
    expect(r.mention).toEqual(["u3"]);
    expect(r.reply).toEqual([]);
  });
  it("never notifies the actor", () => {
    const r = notifyTargets({ actorId: "u1", mentionedUserIds: ["u1"], participantIds: ["u1"] });
    expect(r.mention).toEqual([]);
    expect(r.reply).toEqual([]);
  });
});
