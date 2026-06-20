import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import type { AiProvider, LLMProviderConfig } from "@claril/ai-advisor";
import { decryptSecret } from "@/lib/crypto";

/** The org the user belongs to (V1: first membership). */
export async function getUserOrgId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

/** Decrypted, ready-to-use AI config for an org, or null if AI isn't set up. */
export async function getOrgAiConfig(orgId: string): Promise<LLMProviderConfig | null> {
  const rows = await db
    .select()
    .from(schema.aiProviderConfig)
    .where(eq(schema.aiProviderConfig.organizationId, orgId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Cloud providers need a key; Ollama (local) can run without one.
  const hasUsableCredential = Boolean(row.encryptedKey) || row.provider === "ollama";
  if (!hasUsableCredential) return null;

  return {
    provider: row.provider as AiProvider,
    model: row.model ?? undefined,
    baseUrl: row.baseUrl ?? undefined,
    apiKey: row.encryptedKey ? decryptSecret(row.encryptedKey) : undefined,
  };
}
