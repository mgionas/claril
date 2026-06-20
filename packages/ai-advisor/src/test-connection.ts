import { generateText } from "ai";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * Issue a minimal generation through the provider abstraction to verify a BYOK
 * config works before saving. Provider-neutral; the caller passes the same
 * config shape used everywhere else. Never echoes the key.
 */
export async function testConnection(config: LLMProviderConfig): Promise<ConnectionTestResult> {
  try {
    const model = createModel(config);
    await generateText({
      model,
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 8,
    });
    return { ok: true, message: "Connection works." };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Test failed: ${detail.slice(0, 200)}` };
  }
}
