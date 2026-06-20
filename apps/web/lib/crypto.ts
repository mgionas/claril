import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Symmetric encryption for BYOK secrets at rest (AES-256-GCM). The key is
 * derived from CLARIL_ENCRYPTION_KEY (preferred) or BETTER_AUTH_SECRET so
 * on-prem deployments don't need an extra secret to get started.
 */
function deriveKey(): Buffer {
  const secret = process.env.CLARIL_ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Set CLARIL_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) to encrypt AI provider keys.",
    );
  }
  return scryptSync(secret, "claril-ai-provider-key", 32);
}

/** Returns `iv:tag:ciphertext`, all base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
