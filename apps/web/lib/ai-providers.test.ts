import { describe, expect, it } from "vitest";
import { PROVIDER_META, providerMeta, keyLooksValid } from "./ai-providers";

describe("PROVIDER_META", () => {
  it("every provider has a description and steps", () => {
    for (const p of PROVIDER_META) {
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThan(0);
    }
  });
  it("every key-needing provider has a key placeholder", () => {
    for (const p of PROVIDER_META) {
      if (p.needsKey) expect(p.keyPlaceholder && p.keyPlaceholder.length > 0).toBe(true);
    }
  });
  it("providerMeta resolves each provider by value", () => {
    for (const p of PROVIDER_META) {
      expect(providerMeta(p.value).value).toBe(p.value);
    }
  });
});

describe("keyLooksValid", () => {
  it("accepts a blank key (means: keep existing)", () => {
    expect(keyLooksValid("anthropic", "")).toBe(true);
    expect(keyLooksValid("anthropic", "   ")).toBe(true);
  });
  it("accepts a correct-prefix key and rejects a wrong-prefix one", () => {
    expect(keyLooksValid("anthropic", "sk-ant-abc123")).toBe(true);
    expect(keyLooksValid("anthropic", "sk-abc123")).toBe(false);
  });
  it("accepts any non-empty key for a provider without a stable prefix", () => {
    expect(keyLooksValid("google", "AIzaSyWhatever")).toBe(true);
  });
  it("accepts anything for ollama (no key needed)", () => {
    expect(keyLooksValid("ollama", "anything")).toBe(true);
    expect(keyLooksValid("ollama", "")).toBe(true);
  });
});
