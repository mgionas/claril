"use server";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import {
  advise,
  generateProcessDoc,
  answerQuestion,
  type AiProvider,
} from "@claril/ai-advisor";
import { auth } from "@/lib/auth";
import { getOrgAiConfig, getUserOrgId } from "@/lib/ai";
import { assertDiagramAccess } from "@/lib/tenancy";
import { encryptSecret } from "@/lib/crypto";
import { buildDiagramAssetContext } from "@/lib/catalog-grounding";

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

/** Persist a diagram's content (debounced autosave from the canvas). */
export async function saveDiagramContent(diagramId: string, content: string): Promise<void> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  await db
    .update(schema.diagram)
    .set({ content, updatedAt: new Date() })
    .where(eq(schema.diagram.id, diagramId));
}

/** Snapshot the current content as a named version. */
export async function createDiagramVersion(diagramId: string, label?: string): Promise<void> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  const rows = await db
    .select({ content: schema.diagram.content })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  if (!rows[0]) return;
  await db.insert(schema.version).values({
    id: crypto.randomUUID(),
    diagramId,
    content: rows[0].content,
    label: label ?? null,
    createdBy: userId,
  });
}

/* ---- AI (BYOK, org-level) ---- */

export interface AiStatus {
  connected: boolean;
  provider?: string;
  model?: string;
}

export async function getAiStatus(): Promise<AiStatus> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  if (!orgId) return { connected: false };
  const config = await getOrgAiConfig(orgId);
  if (!config) return { connected: false };
  return { connected: true, provider: config.provider, model: config.model };
}

export interface SaveAiConfigInput {
  provider: AiProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export async function saveAiConfig(input: SaveAiConfigInput): Promise<void> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  if (!orgId) throw new Error("No organization.");

  const membership = (
    await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
      .limit(1)
  )[0];
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new Error("Only organization owners or admins can configure AI.");
  }

  const existing = (
    await db
      .select()
      .from(schema.aiProviderConfig)
      .where(eq(schema.aiProviderConfig.organizationId, orgId))
      .limit(1)
  )[0];

  const encryptedKey =
    input.apiKey && input.apiKey.length > 0
      ? encryptSecret(input.apiKey)
      : (existing?.encryptedKey ?? null);

  const values = {
    provider: input.provider,
    model: input.model && input.model.length > 0 ? input.model : null,
    baseUrl: input.baseUrl && input.baseUrl.length > 0 ? input.baseUrl : null,
    encryptedKey,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.aiProviderConfig)
      .set(values)
      .where(eq(schema.aiProviderConfig.organizationId, orgId));
  } else {
    await db
      .insert(schema.aiProviderConfig)
      .values({ id: crypto.randomUUID(), organizationId: orgId, ...values });
  }
}

/**
 * Run the AI advisor, grounded on the deterministic findings — and, when a
 * `diagramId` is supplied, on the Asset Catalog assets bound to that diagram
 * (real service semantics). The grounding is best-effort and additive: if the
 * catalog is empty the advisor behaves exactly as before.
 */
export async function runAdvisor(
  graph: ProcessGraph,
  findings: Finding[],
  question?: string,
  diagramId?: string,
): Promise<Finding[]> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  const config = orgId ? await getOrgAiConfig(orgId) : null;
  if (!config) throw new Error("No AI provider configured.");

  const assetContext =
    orgId && diagramId ? await buildDiagramAssetContext(orgId, diagramId) : undefined;

  return advise({ graph, findings, question, assetContext }, config);
}

/**
 * Resolve the org-level BYOK config + (optional) diagram asset grounding for an
 * AI call. Shared by every T3 advisor capability so config + grounding stay
 * identical. Throws "No AI provider configured." when AI is off — callers route
 * that to the one-click setup dialog.
 */
async function resolveAiContext(diagramId?: string) {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  const config = orgId ? await getOrgAiConfig(orgId) : null;
  if (!config) throw new Error("No AI provider configured.");
  const assetContext =
    orgId && diagramId ? await buildDiagramAssetContext(orgId, diagramId) : undefined;
  return { config, assetContext };
}

/**
 * Generate human-readable Markdown documentation for a process, grounded on the
 * deterministic findings and (when `diagramId` is given) the Asset Catalog.
 * Returns the Markdown string. BYOK / provider-agnostic.
 */
export async function runDocGen(
  graph: ProcessGraph,
  findings: Finding[],
  diagramId?: string,
): Promise<string> {
  const { config, assetContext } = await resolveAiContext(diagramId);
  return generateProcessDoc({ graph, findings, assetContext }, config);
}

/**
 * Answer a user's natural-language question about the diagram in prose, grounded
 * the same way as the advisor. Returns the answer string. BYOK / provider-agnostic.
 */
export async function runAdvisorQuestion(
  graph: ProcessGraph,
  findings: Finding[],
  question: string,
  diagramId?: string,
): Promise<string> {
  const { config, assetContext } = await resolveAiContext(diagramId);
  return answerQuestion({ graph, findings, question, assetContext }, config);
}
