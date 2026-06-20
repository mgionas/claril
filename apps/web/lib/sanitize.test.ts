import { describe, expect, it } from "vitest";
import { stripLoneSurrogates } from "./sanitize";

describe("stripLoneSurrogates", () => {
  it("removes a lone high surrogate", () => {
    expect(stripLoneSurrogates("a\uD800b")).toBe("ab");
  });
  it("removes a lone low surrogate", () => {
    expect(stripLoneSurrogates("a\uDC00b")).toBe("ab");
  });
  it("preserves a valid surrogate pair (emoji)", () => {
    const emoji = "💡";
    expect(stripLoneSurrogates(`x${emoji}y`)).toBe(`x${emoji}y`);
  });
  it("leaves plain text untouched", () => {
    expect(stripLoneSurrogates("hello world")).toBe("hello world");
  });
  it("handles a high surrogate at end of string", () => {
    expect(stripLoneSurrogates("end\uD83D")).toBe("end");
  });
});
