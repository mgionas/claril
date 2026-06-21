"use server";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import {
  adviseWithUsage,
  generateProcessDocWithUsage,
  generateBpmnXmlWithUsage,
  planEditsWithUsage,
  DEFAULT_MODELS,
  type AiProvider,
  type EditPlan,
} from "@claril/ai-advisor";
import { parseBpmnXml, BpmnParseError } from "@claril/bpmn-parse";
import { layoutProcess } from "bpmn-auto-layout";
import {
  diagramContext,
  getAiConfig,
  getOrgAiConfig,
  getUserOrgId,
  listOrgConnections,
  listUserConnections,
  repointDefault,
  type AiContext,
  type AiOverride,
  type ConnectionView,
} from "@/lib/ai";
import { getActiveContext } from "@/lib/context";
import { assertDiagramAccess } from "@/lib/tenancy";
import { encryptSecret } from "@/lib/crypto";
import { buildDiagramAssetContext } from "@/lib/catalog-grounding";
import { recordAiUsage, projectIdForDiagram } from "@/lib/ai-usage";
import { requireUserId } from "@/lib/session";

/** Persist a diagram's content (debounced autosave from the canvas). */
export async function saveDiagramContent(diagramId: string, content: string): Promise<void> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  await db
    .update(schema.diagram)
    .set({ content, updatedAt: new Date() })
    .where(eq(schema.diagram.id, diagramId));
}

export type VersionSource = "manual" | "auto" | "ai" | "import" | "restore";

/** Snapshot the current content as a named version. */
export async function createDiagramVersion(
  diagramId: string,
  label?: string,
  source: VersionSource = "manual",
): Promise<void> {
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
    source,
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

/* ---- AI (multi-provider, org-level) ---- */

/**
 * Resolve the caller's org and assert they may configure AI (owner/admin).
 * Throws on no org / insufficient role. Returns the orgId for the write.
 */
async function requireOrgAdmin(): Promise<string> {
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
  return orgId;
}

export interface ConnectAiProviderInput {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export async function connectAiProvider(input: ConnectAiProviderInput): Promise<void> {
  const orgId = await requireOrgAdmin();
  const existing = (
    await db
      .select()
      .from(schema.aiConnection)
      .where(
        and(
          eq(schema.aiConnection.organizationId, orgId),
          eq(schema.aiConnection.provider, input.provider),
        ),
      )
      .limit(1)
  )[0];

  const encryptedKey =
    input.apiKey && input.apiKey.length > 0
      ? encryptSecret(input.apiKey)
      : (existing?.encryptedKey ?? null);

  const defaultModel =
    (input.defaultModel && input.defaultModel.length > 0 ? input.defaultModel : null) ??
    existing?.defaultModel ??
    DEFAULT_MODELS[input.provider];

  const baseUrl = input.baseUrl && input.baseUrl.length > 0 ? input.baseUrl : null;

  if (existing) {
    await db
      .update(schema.aiConnection)
      .set({ encryptedKey, baseUrl, defaultModel, updatedAt: new Date() })
      .where(
        and(
          eq(schema.aiConnection.organizationId, orgId),
          eq(schema.aiConnection.provider, input.provider),
        ),
      );
  } else {
    await db.insert(schema.aiConnection).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      provider: input.provider,
      encryptedKey,
      baseUrl,
      defaultModel,
    });
  }
}

export async function removeAiProvider(provider: AiProvider): Promise<void> {
  const orgId = await requireOrgAdmin();
  await db
    .delete(schema.aiConnection)
    .where(
      and(
        eq(schema.aiConnection.organizationId, orgId),
        eq(schema.aiConnection.provider, provider),
      ),
    );

  const def = (
    await db
      .select()
      .from(schema.aiOrgDefault)
      .where(eq(schema.aiOrgDefault.organizationId, orgId))
      .limit(1)
  )[0];
  if (!def || def.provider !== provider) return;

  const remaining = await db
    .select()
    .from(schema.aiConnection)
    .where(eq(schema.aiConnection.organizationId, orgId));
  const next = repointDefault(
    remaining.map((c) => ({
      provider: c.provider,
      encryptedKey: c.encryptedKey,
      defaultModel: c.defaultModel,
      baseUrl: c.baseUrl,
    })),
  );
  if (!next) {
    await db.delete(schema.aiOrgDefault).where(eq(schema.aiOrgDefault.organizationId, orgId));
  } else {
    const nextConn = remaining.find((c) => c.provider === next)!;
    await db
      .update(schema.aiOrgDefault)
      .set({
        provider: next,
        model: nextConn.defaultModel ?? DEFAULT_MODELS[next as AiProvider],
        updatedAt: new Date(),
      })
      .where(eq(schema.aiOrgDefault.organizationId, orgId));
  }
}

export async function setOrgDefaultModel(input: {
  provider: AiProvider;
  model: string;
}): Promise<void> {
  const orgId = await requireOrgAdmin();
  const conn = (
    await db
      .select()
      .from(schema.aiConnection)
      .where(
        and(
          eq(schema.aiConnection.organizationId, orgId),
          eq(schema.aiConnection.provider, input.provider),
        ),
      )
      .limit(1)
  )[0];
  const usable = conn && (Boolean(conn.encryptedKey) || conn.provider === "ollama");
  if (!usable) throw new Error("That provider isn't connected.");

  const existing = (
    await db
      .select()
      .from(schema.aiOrgDefault)
      .where(eq(schema.aiOrgDefault.organizationId, orgId))
      .limit(1)
  )[0];
  if (existing) {
    await db
      .update(schema.aiOrgDefault)
      .set({ provider: input.provider, model: input.model, updatedAt: new Date() })
      .where(eq(schema.aiOrgDefault.organizationId, orgId));
  } else {
    await db
      .insert(schema.aiOrgDefault)
      .values({ organizationId: orgId, provider: input.provider, model: input.model });
  }
}

export interface AiSettingsView {
  canEdit: boolean;
  connections: ConnectionView[];
  orgDefault?: { provider: AiProvider; model: string };
}

export async function getAiSettings(): Promise<AiSettingsView> {
  const userId = await requireUserId();
  const orgId = await getUserOrgId(userId);
  if (!orgId) return { canEdit: false, connections: [] };
  const membership = (
    await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
      .limit(1)
  )[0];
  const canEdit = membership?.role === "owner" || membership?.role === "admin";
  const connections = await listOrgConnections(orgId);
  const defRows = await db
    .select()
    .from(schema.aiOrgDefault)
    .where(eq(schema.aiOrgDefault.organizationId, orgId))
    .limit(1);
  const orgDefault = defRows[0]
    ? { provider: defRows[0].provider as AiProvider, model: defRows[0].model }
    : undefined;
  return { canEdit, connections, orgDefault };
}

/* ---- AI (multi-provider, user/personal-level) ---- */

export interface ConnectUserAiProviderInput {
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export async function connectUserAiProvider(input: ConnectUserAiProviderInput): Promise<void> {
  const userId = await requireUserId();
  const existing = (
    await db.select().from(schema.userAiConnection)
      .where(and(eq(schema.userAiConnection.userId, userId), eq(schema.userAiConnection.provider, input.provider)))
      .limit(1)
  )[0];
  const encryptedKey =
    input.apiKey && input.apiKey.length > 0 ? encryptSecret(input.apiKey) : (existing?.encryptedKey ?? null);
  const defaultModel =
    (input.defaultModel && input.defaultModel.length > 0 ? input.defaultModel : null) ??
    existing?.defaultModel ?? DEFAULT_MODELS[input.provider];
  const baseUrl = input.baseUrl && input.baseUrl.length > 0 ? input.baseUrl : null;
  if (existing) {
    await db.update(schema.userAiConnection)
      .set({ encryptedKey, baseUrl, defaultModel, updatedAt: new Date() })
      .where(and(eq(schema.userAiConnection.userId, userId), eq(schema.userAiConnection.provider, input.provider)));
  } else {
    await db.insert(schema.userAiConnection).values({
      id: crypto.randomUUID(), userId, provider: input.provider, encryptedKey, baseUrl, defaultModel,
    });
  }
}

export async function removeUserAiProvider(provider: AiProvider): Promise<void> {
  const userId = await requireUserId();
  await db.delete(schema.userAiConnection)
    .where(and(eq(schema.userAiConnection.userId, userId), eq(schema.userAiConnection.provider, provider)));
  const def = (
    await db.select().from(schema.userAiDefault).where(eq(schema.userAiDefault.userId, userId)).limit(1)
  )[0];
  if (!def || def.provider !== provider) return;
  const remaining = await db.select().from(schema.userAiConnection).where(eq(schema.userAiConnection.userId, userId));
  const next = repointDefault(
    remaining.map((c) => ({ provider: c.provider, encryptedKey: c.encryptedKey, defaultModel: c.defaultModel, baseUrl: c.baseUrl })),
  );
  if (!next) {
    await db.delete(schema.userAiDefault).where(eq(schema.userAiDefault.userId, userId));
  } else {
    const nextConn = remaining.find((c) => c.provider === next)!;
    await db.update(schema.userAiDefault)
      .set({ provider: next, model: nextConn.defaultModel ?? DEFAULT_MODELS[next as AiProvider], updatedAt: new Date() })
      .where(eq(schema.userAiDefault.userId, userId));
  }
}

export async function setUserDefaultModel(input: { provider: AiProvider; model: string }): Promise<void> {
  const userId = await requireUserId();
  const conn = (
    await db.select().from(schema.userAiConnection)
      .where(and(eq(schema.userAiConnection.userId, userId), eq(schema.userAiConnection.provider, input.provider)))
      .limit(1)
  )[0];
  const usable = conn && (Boolean(conn.encryptedKey) || conn.provider === "ollama");
  if (!usable) throw new Error("That provider isn't connected.");
  const existing = (
    await db.select().from(schema.userAiDefault).where(eq(schema.userAiDefault.userId, userId)).limit(1)
  )[0];
  if (existing) {
    await db.update(schema.userAiDefault)
      .set({ provider: input.provider, model: input.model, updatedAt: new Date() })
      .where(eq(schema.userAiDefault.userId, userId));
  } else {
    await db.insert(schema.userAiDefault).values({ userId, provider: input.provider, model: input.model });
  }
}

/** Personal AI settings for the connections manager (always editable — own keys). */
export async function getUserAiSettings(): Promise<AiSettingsView> {
  const userId = await requireUserId();
  const connections = await listUserConnections(userId);
  const defRows = await db.select().from(schema.userAiDefault).where(eq(schema.userAiDefault.userId, userId)).limit(1);
  const orgDefault = defRows[0]
    ? { provider: defRows[0].provider as AiProvider, model: defRows[0].model }
    : undefined;
  return { canEdit: true, connections, orgDefault };
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
  override?: AiOverride,
): Promise<Finding[]> {
  const { config, assetContext, orgId, projectId } = await resolveAiContext(diagramId, override);

  const { value, usage } = await adviseWithUsage(
    { graph, findings, question, assetContext },
    config,
  );
  if (orgId) {
    await recordAiUsage({
      organizationId: orgId,
      projectId,
      diagramId,
      kind: "advisor",
      provider: config.provider,
      model: config.model ?? "unknown",
      usage,
    });
  }
  return value;
}

/**
 * Resolve the org-level BYOK config + (optional) diagram asset grounding for an
 * AI call. Shared by every T3 advisor capability so config + grounding stay
 * identical. Throws "No AI provider configured." when AI is off — callers route
 * that to the one-click setup dialog.
 */
async function resolveAiContext(diagramId?: string, override?: AiOverride) {
  const userId = await requireUserId();
  let ctx: AiContext;
  let orgId: string | undefined;
  if (diagramId) {
    const dc = await diagramContext(userId, diagramId);
    ctx = dc.ctx;
    orgId = dc.orgId;
  } else {
    const active = await getActiveContext();
    if (!active) throw new Error("No AI provider configured.");
    ctx = active;
    orgId = active.kind === "org" ? active.orgId : undefined;
  }
  const config = await getAiConfig(ctx, override);
  if (!config) throw new Error("No AI provider configured.");
  // Catalog/asset grounding only exists for org diagrams — never personal.
  const assetContext =
    diagramId && orgId ? await buildDiagramAssetContext(orgId, diagramId) : undefined;
  const projectId = diagramId ? await projectIdForDiagram(diagramId) : null;
  return { config, assetContext, orgId: orgId ?? null, projectId };
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
  override?: AiOverride,
): Promise<string> {
  const { config, assetContext, orgId, projectId } = await resolveAiContext(diagramId, override);
  const { value, usage } = await generateProcessDocWithUsage(
    { graph, findings, assetContext },
    config,
  );
  if (orgId) {
    await recordAiUsage({
      organizationId: orgId,
      projectId,
      diagramId,
      kind: "docgen",
      provider: config.provider,
      model: config.model ?? "unknown",
      usage,
    });
  }
  if (diagramId) await upsertDiagramDoc(diagramId, value, config.model ?? null);
  return value;
}

/**
 * Read the persisted AI documentation for a diagram, if any. Best-effort: the
 * `diagram_doc` table is an optional cache, so a query failure (e.g. the
 * migration hasn't been applied on a fresh/self-hosted DB) degrades to "no
 * persisted doc" rather than crashing the diagram page.
 */
export async function getDiagramDoc(diagramId: string): Promise<string | null> {
  const userId = await requireUserId();
  await assertDiagramAccess(userId, diagramId);
  try {
    const rows = await db
      .select({ markdown: schema.diagramDoc.markdown })
      .from(schema.diagramDoc)
      .where(eq(schema.diagramDoc.diagramId, diagramId))
      .limit(1);
    return rows[0]?.markdown ?? null;
  } catch {
    return null;
  }
}

/** Persist generated docs. Best-effort — never block doc generation on it. */
async function upsertDiagramDoc(
  diagramId: string,
  markdown: string,
  model: string | null,
): Promise<void> {
  try {
    await db
      .insert(schema.diagramDoc)
      .values({ diagramId, markdown, model, generatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.diagramDoc.diagramId,
        set: { markdown, model, generatedAt: new Date() },
      });
  } catch {
    // Optional cache; if the table is missing the doc is simply not persisted.
  }
}

/** Plan model edits from a natural-language instruction. Grounded + BYOK. */
export async function runDiagramEdit(
  graph: ProcessGraph,
  findings: Finding[],
  instruction: string,
  diagramId?: string,
  override?: AiOverride,
): Promise<EditPlan> {
  const { config, assetContext, orgId, projectId } = await resolveAiContext(diagramId, override);
  const { plan, usage } = await planEditsWithUsage(
    { graph, findings, instruction, assetContext },
    config,
  );
  if (orgId) {
    await recordAiUsage({
      organizationId: orgId,
      projectId,
      diagramId,
      kind: "plan",
      provider: config.provider,
      model: config.model ?? "unknown",
      usage,
    });
  }
  return plan;
}

/**
 * Remove markdown code fences (```xml … ```) if present — including the common
 * case where the model emits a short note before/after the block. We extract the
 * content of the first fenced block when one exists, otherwise return the input
 * trimmed (so already-bare XML is untouched). This is more robust than only
 * peeling a leading fence: some providers prepend "Here is the BPMN:".
 */
function stripCodeFences(raw: string): string {
  const text = raw.trim();
  // Prefer the content of the first fenced block, if any.
  const fenced = /```(?:xml|bpmn)?\s*\n?([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  // No closing fence — peel a leading fence line if present.
  if (text.startsWith("```")) {
    const firstNewline = text.indexOf("\n");
    return firstNewline === -1 ? "" : text.slice(firstNewline + 1).trim();
  }
  return text;
}

/** Count occurrences of a BPMN DI edge element regardless of namespace prefix. */
function countDiEdges(xml: string): number {
  return (xml.match(/<[\w-]*:?BPMNEdge[\s/>]/g) ?? []).length;
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
export async function generateDiagramFromPrompt(
  description: string,
  override?: AiOverride,
): Promise<string> {
  const prompt = description.trim();
  if (!prompt) throw new Error("Describe the process you want to generate.");

  // Same BYOK resolution as every other T3 capability. Throws
  // "No AI provider configured." when AI is off.
  const { config, orgId } = await resolveAiContext(undefined, override);

  const { value: raw, usage } = await generateBpmnXmlWithUsage(prompt, config);
  if (orgId) {
    await recordAiUsage({
      organizationId: orgId,
      projectId: null,
      diagramId: null,
      kind: "generate",
      provider: config.provider,
      model: config.model ?? "unknown",
      usage,
    });
  }
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

  let parsed: Awaited<ReturnType<typeof parseBpmnXml>>;
  try {
    parsed = await parseBpmnXml(laidOut);
  } catch (cause) {
    if (cause instanceof BpmnParseError) {
      throw new Error(
        "The AI produced invalid BPMN. Try rephrasing the description.",
        { cause },
      );
    }
    throw cause;
  }

  // The diagram is structurally valid but may still be unrenderable. The layout
  // engine (bpmn-auto-layout) derives node positions and connections from each
  // flow node's <incoming>/<outgoing> child refs; when the model emits only
  // sequenceFlow sourceRef/targetRef (or wraps multiple pools the engine can't
  // place), the result is disconnected, arrow-less boxes. Detect that here —
  // every sequence flow should yield a DI edge — and fail loudly so the user
  // gets an actionable message instead of a blank/broken canvas.
  const flowCount = parsed.graph.flows.length;
  if (flowCount === 0) {
    throw new Error(
      "The AI returned a process with no connected steps. Try a more detailed description.",
    );
  }
  if (countDiEdges(laidOut) < flowCount) {
    throw new Error(
      "The AI produced a process whose steps aren’t connected, so it can’t be drawn. Try rephrasing the description.",
    );
  }

  return laidOut;
}
