"use server";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import {
  advise,
  generateProcessDoc,
  generateBpmnXml,
  answerQuestion,
  planEdits,
  DEFAULT_MODELS,
  type AiProvider,
  type EditPlan,
} from "@claril/ai-advisor";
import { parseBpmnXml, BpmnParseError } from "@claril/bpmn-parse";
import { layoutProcess } from "bpmn-auto-layout";
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

export interface AiConfigView {
  provider: AiProvider;
  model?: string;
  baseUrl?: string;
  /** Whether an encrypted key is stored. The key itself is never returned. */
  hasKey: boolean;
  /** Whether the current user may edit (owner/admin). */
  canEdit: boolean;
}

/** Current org AI config for the settings page — never returns the key. */
export async function getAiConfigForSettings(): Promise<AiConfigView | null> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  if (!orgId) return null;

  const membership = (
    await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
      .limit(1)
  )[0];
  const canEdit = membership?.role === "owner" || membership?.role === "admin";

  const row = (
    await db
      .select()
      .from(schema.aiProviderConfig)
      .where(eq(schema.aiProviderConfig.organizationId, orgId))
      .limit(1)
  )[0];

  if (!row) return null;
  return {
    provider: row.provider as AiProvider,
    model: row.model ?? undefined,
    baseUrl: row.baseUrl ?? undefined,
    hasKey: Boolean(row.encryptedKey),
    canEdit,
  };
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

  // Always persist a concrete model id: use the user's pick, else the
  // previously saved one, else the provider's recommended default. This is the
  // belt-and-suspenders fix for the "model id required" throw downstream.
  const model =
    (input.model && input.model.length > 0 ? input.model : null) ??
    (existing && existing.provider === input.provider ? existing.model : null) ??
    DEFAULT_MODELS[input.provider];

  const values = {
    provider: input.provider,
    model,
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

/** Remove the org's AI provider config (key + model). Owner/admin only. */
export async function removeAiConfig(): Promise<void> {
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

  await db
    .delete(schema.aiProviderConfig)
    .where(eq(schema.aiProviderConfig.organizationId, orgId));
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

/** Plan model edits from a natural-language instruction. Grounded + BYOK. */
export async function runDiagramEdit(
  graph: ProcessGraph,
  findings: Finding[],
  instruction: string,
  diagramId?: string,
): Promise<EditPlan> {
  const { config, assetContext } = await resolveAiContext(diagramId);
  return planEdits({ graph, findings, instruction, assetContext }, config);
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

/** Remove a leading/trailing markdown code fence (```xml … ```) if present. */
function stripCodeFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    // Drop the opening fence line (``` or ```xml / ```bpmn).
    const firstNewline = text.indexOf("\n");
    text = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
    // Drop a trailing closing fence.
    const lastFence = text.lastIndexOf("```");
    if (lastFence !== -1) text = text.slice(0, lastFence);
  }
  return text.trim();
}

/**
 * Generate a BPMN diagram from a natural-language description. Resolves the
 * org-level BYOK config (like {@link runDocGen}), asks the model for semantic
 * BPMN XML, strips any markdown fences, runs `bpmn-auto-layout` (DOM-free) to
 * add diagram interchange so it renders, then validates with the shared
 * `@claril/bpmn-parse`. Returns the laid-out, validated XML. Throws a friendly
 * error if the model's output cannot be turned into a valid diagram.
 *
 * No persistence happens here — the caller passes the returned XML to
 * `createDiagram(projectId, "bpmn", name, content)`.
 */
export async function generateDiagramFromPrompt(description: string): Promise<string> {
  const prompt = description.trim();
  if (!prompt) throw new Error("Describe the process you want to generate.");

  // Same BYOK resolution as every other T3 capability. Throws
  // "No AI provider configured." when AI is off.
  const { config } = await resolveAiContext();

  const raw = await generateBpmnXml(prompt, config);
  const semantic = stripCodeFences(raw);
  if (!semantic) {
    throw new Error("The AI returned an empty diagram. Try a more detailed description.");
  }

  let laidOut: string;
  try {
    laidOut = await layoutProcess(semantic);
  } catch (cause) {
    throw new Error(
      "The AI produced BPMN that could not be laid out. Try rephrasing the description.",
      { cause },
    );
  }

  try {
    await parseBpmnXml(laidOut);
  } catch (cause) {
    if (cause instanceof BpmnParseError) {
      throw new Error(
        "The AI produced invalid BPMN. Try rephrasing the description.",
        { cause },
      );
    }
    throw cause;
  }

  return laidOut;
}
