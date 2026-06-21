import { asc, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { DEFAULT_MODELS, type AiProvider, type LLMProviderConfig } from "@claril/ai-advisor";
import { decryptSecret } from "@/lib/crypto";

/** The org the user belongs to (V1: first membership). */
export async function getUserOrgId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    // Stable choice for users in multiple orgs: earliest membership wins.
    .orderBy(asc(schema.member.createdAt))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

/** Per-run resolution override. */
export interface AiOverride {
  provider?: AiProvider;
  model?: string;
}

/** Minimal connection shape the pure resolver needs (subset of `aiConnection`). */
export interface ConnRow {
  provider: string;
  encryptedKey: string | null;
  defaultModel: string | null;
  baseUrl: string | null;
}

/** A provider connection summarized for the UI (no secrets). */
export interface ConnectionView {
  provider: AiProvider;
  hasKey: boolean;
  usable: boolean;
  baseUrl?: string;
  defaultModel?: string;
  isOrgDefault: boolean;
}

const isUsable = (c: { provider: string; encryptedKey: string | null }) =>
  Boolean(c.encryptedKey) || c.provider === "ollama";

/**
 * Pure resolution of which connection + model to use. Order: explicit override
 * provider → org default provider → the sole usable connection → null. Model
 * precedence: override model → org-default model (when that provider is chosen)
 * → connection.defaultModel → DEFAULT_MODELS[provider]. No I/O, no decryption.
 */
export function resolveConnection(
  conns: ConnRow[],
  orgDefault: { provider: string; model: string } | null,
  opts?: AiOverride,
): { provider: AiProvider; model: string; baseUrl?: string; encryptedKey: string | null } | null {
  let provider: string | undefined = opts?.provider ?? orgDefault?.provider;
  let conn: ConnRow | undefined;

  if (provider) {
    conn = conns.find((c) => c.provider === provider);
  } else {
    const usable = conns.filter(isUsable);
    if (usable.length === 1) {
      conn = usable[0];
      provider = conn.provider;
    }
  }

  if (!conn || !provider || !isUsable(conn)) return null;

  const model =
    (opts?.model && opts.model.length > 0 ? opts.model : undefined) ??
    (orgDefault && orgDefault.provider === provider ? orgDefault.model : undefined) ??
    conn.defaultModel ??
    DEFAULT_MODELS[provider as AiProvider];

  return {
    provider: provider as AiProvider,
    model,
    baseUrl: conn.baseUrl ?? undefined,
    encryptedKey: conn.encryptedKey,
  };
}

/**
 * Deterministically pick a provider to repoint the org default to after a
 * connection is removed: the first usable remaining provider (alphabetical),
 * or null when none remain usable.
 */
export function repointDefault(remaining: ConnRow[]): string | null {
  return (
    remaining
      .filter(isUsable)
      .map((c) => c.provider)
      .sort()[0] ?? null
  );
}

/**
 * Decrypted, ready-to-use AI config for an org, or null when nothing usable.
 * `opts` lets a single run override the provider/model (workbench selector);
 * with no opts it resolves the org default, then the sole-connection rule.
 */
export async function getOrgAiConfig(
  orgId: string,
  opts?: AiOverride,
): Promise<LLMProviderConfig | null> {
  const [conns, defRows] = await Promise.all([
    db.select().from(schema.aiConnection).where(eq(schema.aiConnection.organizationId, orgId)),
    db
      .select()
      .from(schema.aiOrgDefault)
      .where(eq(schema.aiOrgDefault.organizationId, orgId))
      .limit(1),
  ]);

  const def = defRows[0] ? { provider: defRows[0].provider, model: defRows[0].model } : null;
  const resolved = resolveConnection(conns, def, opts);
  if (!resolved) return null;

  return {
    provider: resolved.provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    apiKey: resolved.encryptedKey ? decryptSecret(resolved.encryptedKey) : undefined,
  };
}

/** All connections for an org, summarized for settings cards + the workbench selector. */
export async function listOrgConnections(orgId: string): Promise<ConnectionView[]> {
  const [conns, defRows] = await Promise.all([
    db.select().from(schema.aiConnection).where(eq(schema.aiConnection.organizationId, orgId)),
    db
      .select()
      .from(schema.aiOrgDefault)
      .where(eq(schema.aiOrgDefault.organizationId, orgId))
      .limit(1),
  ]);
  const defaultProvider = defRows[0]?.provider;
  return conns
    .map((c) => ({
      provider: c.provider as AiProvider,
      hasKey: Boolean(c.encryptedKey),
      usable: isUsable(c),
      baseUrl: c.baseUrl ?? undefined,
      defaultModel: c.defaultModel ?? undefined,
      isOrgDefault: c.provider === defaultProvider,
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

/** Which scope an AI call resolves against. */
export type AiContext = { kind: "personal"; userId: string } | { kind: "org"; orgId: string };

/** Decrypted personal (user-scoped) AI config, or null when nothing usable. */
export async function getUserAiConfig(
  userId: string,
  opts?: AiOverride,
): Promise<LLMProviderConfig | null> {
  const [conns, defRows] = await Promise.all([
    db.select().from(schema.userAiConnection).where(eq(schema.userAiConnection.userId, userId)),
    db
      .select()
      .from(schema.userAiDefault)
      .where(eq(schema.userAiDefault.userId, userId))
      .limit(1),
  ]);
  const def = defRows[0] ? { provider: defRows[0].provider, model: defRows[0].model } : null;
  const resolved = resolveConnection(conns, def, opts);
  if (!resolved) return null;
  return {
    provider: resolved.provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    apiKey: resolved.encryptedKey ? decryptSecret(resolved.encryptedKey) : undefined,
  };
}

/** Personal connections summarized for the (future) settings UI. */
export async function listUserConnections(userId: string): Promise<ConnectionView[]> {
  const [conns, defRows] = await Promise.all([
    db.select().from(schema.userAiConnection).where(eq(schema.userAiConnection.userId, userId)),
    db
      .select()
      .from(schema.userAiDefault)
      .where(eq(schema.userAiDefault.userId, userId))
      .limit(1),
  ]);
  const defaultProvider = defRows[0]?.provider;
  return conns
    .map((c) => ({
      provider: c.provider as AiProvider,
      hasKey: Boolean(c.encryptedKey),
      usable: isUsable(c),
      baseUrl: c.baseUrl ?? undefined,
      defaultModel: c.defaultModel ?? undefined,
      isOrgDefault: c.provider === defaultProvider,
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

/** Route an AI-config lookup to the personal or org resolver by context. */
export function getAiConfig(ctx: AiContext, opts?: AiOverride): Promise<LLMProviderConfig | null> {
  return ctx.kind === "personal"
    ? getUserAiConfig(ctx.userId, opts)
    : getOrgAiConfig(ctx.orgId, opts);
}
