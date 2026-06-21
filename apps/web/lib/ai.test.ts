import { describe, expect, it } from "vitest";
import { resolveConnection, repointDefault, type ConnRow } from "./ai";

const conn = (
  provider: string,
  encryptedKey: string | null,
  defaultModel: string | null = null,
  baseUrl: string | null = null,
): ConnRow => ({ provider, encryptedKey, defaultModel, baseUrl });

describe("resolveConnection", () => {
  it("returns null when there are no connections", () => {
    expect(resolveConnection([], null)).toBeNull();
  });

  it("uses the explicit override provider when given", () => {
    const r = resolveConnection(
      [conn("anthropic", "enc-a"), conn("openai", "enc-o")],
      { provider: "anthropic", model: "claude-opus-4-8" },
      { provider: "openai" },
    );
    expect(r?.provider).toBe("openai");
  });

  it("falls back to the org default provider", () => {
    const r = resolveConnection(
      [conn("anthropic", "enc-a"), conn("openai", "enc-o")],
      { provider: "openai", model: "gpt-5.1" },
    );
    expect(r?.provider).toBe("openai");
    expect(r?.model).toBe("gpt-5.1");
  });

  it("uses the sole usable connection when no default is set", () => {
    const r = resolveConnection([conn("anthropic", "enc-a")], null);
    expect(r?.provider).toBe("anthropic");
  });

  it("returns null with multiple connections and no default", () => {
    expect(
      resolveConnection([conn("anthropic", "enc-a"), conn("openai", "enc-o")], null),
    ).toBeNull();
  });

  it("returns null when the override provider has no connection", () => {
    expect(
      resolveConnection([conn("anthropic", "enc-a")], null, { provider: "openai" }),
    ).toBeNull();
  });

  it("returns null when the org default points at a keyless cloud connection", () => {
    expect(
      resolveConnection([conn("anthropic", null)], { provider: "anthropic", model: "claude-x" }),
    ).toBeNull();
  });

  it("treats ollama as usable without a key; cloud needs a key", () => {
    expect(resolveConnection([conn("ollama", null)], null)?.provider).toBe("ollama");
    expect(resolveConnection([conn("anthropic", null)], null)).toBeNull();
  });

  it("model precedence: override > org default(model) > connection.defaultModel > DEFAULT_MODELS", () => {
    expect(
      resolveConnection([conn("anthropic", "k", "claude-x")], { provider: "anthropic", model: "default-m" }, { provider: "anthropic", model: "ovr" })?.model,
    ).toBe("ovr");
    expect(
      resolveConnection([conn("anthropic", "k", "claude-x")], { provider: "anthropic", model: "default-m" })?.model,
    ).toBe("default-m");
    expect(resolveConnection([conn("anthropic", "k", "claude-x")], null)?.model).toBe("claude-x");
    expect(resolveConnection([conn("anthropic", "k", null)], null)?.model).toBe("claude-opus-4-8");
  });
});

describe("repointDefault", () => {
  it("picks the first usable remaining provider (sorted) or null", () => {
    expect(repointDefault([conn("openai", "k"), conn("anthropic", "k")])).toBe("anthropic");
    expect(repointDefault([conn("openai", null)])).toBeNull();
    expect(repointDefault([conn("ollama", null)])).toBe("ollama");
    expect(repointDefault([])).toBeNull();
  });
});
