"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  schema,
  validateAssetValues,
  parseFieldSchema,
  type Asset,
  type AssetType,
  type FieldDef,
} from "@claril/db";
import { auth } from "@/lib/auth";

/**
 * Asset Catalog server actions (org-scoped CRUD + bindings + grounding query).
 *
 * Every action resolves the caller's active org and constrains all reads/writes
 * to it — assets never leak across orgs. Type/asset mutations require an org
 * owner or admin (per the data-model permission matrix); reads are allowed for
 * any member of the org.
 */

interface OrgContext {
  userId: string;
  orgId: string;
  role: string;
}

/** Resolve the caller and their active org membership, or throw. */
async function requireOrg(): Promise<OrgContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  // Prefer the session's active org; fall back to first membership (V1).
  const activeOrgId = session.session.activeOrganizationId ?? null;

  const memberships = await db
    .select({ orgId: schema.member.organizationId, role: schema.member.role })
    .from(schema.member)
    .where(eq(schema.member.userId, userId));

  if (memberships.length === 0) throw new Error("No organization.");

  const chosen =
    (activeOrgId && memberships.find((m) => m.orgId === activeOrgId)) || memberships[0];

  return { userId, orgId: chosen.orgId, role: chosen.role };
}

function requireManage(ctx: OrgContext): void {
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new Error("Only organization owners or admins can manage the catalog.");
  }
}

/* -------------------------------------------------------------------------- */
/* Asset types                                                                */
/* -------------------------------------------------------------------------- */

export async function listAssetTypes(): Promise<AssetType[]> {
  const { orgId } = await requireOrg();
  return db
    .select()
    .from(schema.assetType)
    .where(eq(schema.assetType.organizationId, orgId))
    .orderBy(schema.assetType.name);
}

export interface AssetTypeInput {
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  fieldSchema?: FieldDef[];
}

export async function createAssetType(input: AssetTypeInput): Promise<AssetType> {
  const ctx = await requireOrg();
  requireManage(ctx);
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const fieldSchema = parseFieldSchema(input.fieldSchema ?? []);

  const row = {
    id: randomUUID(),
    organizationId: ctx.orgId,
    name,
    icon: input.icon ?? null,
    color: input.color ?? null,
    description: input.description ?? null,
    builtin: "false",
    fieldSchema,
    updatedAt: new Date(),
  };
  const [created] = await db.insert(schema.assetType).values(row).returning();
  return created;
}

export async function updateAssetType(
  id: string,
  input: AssetTypeInput,
): Promise<AssetType> {
  const ctx = await requireOrg();
  requireManage(ctx);
  const fieldSchema = parseFieldSchema(input.fieldSchema ?? []);
  const [updated] = await db
    .update(schema.assetType)
    .set({
      name: input.name.trim(),
      icon: input.icon ?? null,
      color: input.color ?? null,
      description: input.description ?? null,
      fieldSchema,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.assetType.id, id), eq(schema.assetType.organizationId, ctx.orgId)))
    .returning();
  if (!updated) throw new Error("Asset type not found.");
  return updated;
}

export async function deleteAssetType(id: string): Promise<void> {
  const ctx = await requireOrg();
  requireManage(ctx);
  await db
    .delete(schema.assetType)
    .where(and(eq(schema.assetType.id, id), eq(schema.assetType.organizationId, ctx.orgId)));
}

/**
 * Idempotently seed the four built-in asset types for the active org (Phase A).
 * Safe to call repeatedly; skips types that already exist by name.
 */
export async function ensureBuiltinAssetTypes(): Promise<AssetType[]> {
  const ctx = await requireOrg();
  requireManage(ctx);
  const existing = await db
    .select()
    .from(schema.assetType)
    .where(eq(schema.assetType.organizationId, ctx.orgId));
  const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));

  const toInsert = schema.BUILTIN_ASSET_TYPES.filter(
    (t) => !existingNames.has(t.name.toLowerCase()),
  ).map((t) => ({
    id: randomUUID(),
    organizationId: ctx.orgId,
    name: t.name,
    icon: t.icon,
    color: t.color,
    description: t.description,
    builtin: "true",
    fieldSchema: t.fieldSchema,
    updatedAt: new Date(),
  }));

  if (toInsert.length > 0) {
    await db.insert(schema.assetType).values(toInsert);
  }
  return db
    .select()
    .from(schema.assetType)
    .where(eq(schema.assetType.organizationId, ctx.orgId))
    .orderBy(schema.assetType.name);
}

/* -------------------------------------------------------------------------- */
/* Assets                                                                     */
/* -------------------------------------------------------------------------- */

export async function listAssets(assetTypeId?: string): Promise<Asset[]> {
  const { orgId } = await requireOrg();
  const where = assetTypeId
    ? and(eq(schema.asset.organizationId, orgId), eq(schema.asset.assetTypeId, assetTypeId))
    : eq(schema.asset.organizationId, orgId);
  return db.select().from(schema.asset).where(where).orderBy(schema.asset.name);
}

export interface AssetInput {
  assetTypeId: string;
  name: string;
  description?: string;
  /** Raw field values keyed by FieldDef.key; validated against the type. */
  values?: Record<string, unknown>;
}

/** Load a type and assert it belongs to the org. */
async function requireType(orgId: string, assetTypeId: string): Promise<AssetType> {
  const [type] = await db
    .select()
    .from(schema.assetType)
    .where(and(eq(schema.assetType.id, assetTypeId), eq(schema.assetType.organizationId, orgId)))
    .limit(1);
  if (!type) throw new Error("Asset type not found.");
  return type;
}

export async function createAsset(input: AssetInput): Promise<Asset> {
  const ctx = await requireOrg();
  requireManage(ctx);
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const type = await requireType(ctx.orgId, input.assetTypeId);

  const validated = validateAssetValues(type.fieldSchema as FieldDef[], input.values ?? {});
  if (!validated.ok) {
    throw new Error(`Invalid field values: ${validated.errors?.join("; ")}`);
  }

  const [created] = await db
    .insert(schema.asset)
    .values({
      id: randomUUID(),
      organizationId: ctx.orgId,
      assetTypeId: input.assetTypeId,
      name,
      description: input.description ?? null,
      values: validated.values ?? {},
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function updateAsset(id: string, input: AssetInput): Promise<Asset> {
  const ctx = await requireOrg();
  requireManage(ctx);
  const type = await requireType(ctx.orgId, input.assetTypeId);
  const validated = validateAssetValues(type.fieldSchema as FieldDef[], input.values ?? {});
  if (!validated.ok) {
    throw new Error(`Invalid field values: ${validated.errors?.join("; ")}`);
  }
  const [updated] = await db
    .update(schema.asset)
    .set({
      assetTypeId: input.assetTypeId,
      name: input.name.trim(),
      description: input.description ?? null,
      values: validated.values ?? {},
      updatedAt: new Date(),
    })
    .where(and(eq(schema.asset.id, id), eq(schema.asset.organizationId, ctx.orgId)))
    .returning();
  if (!updated) throw new Error("Asset not found.");
  return updated;
}

export async function deleteAsset(id: string): Promise<void> {
  const ctx = await requireOrg();
  requireManage(ctx);
  await db
    .delete(schema.asset)
    .where(and(eq(schema.asset.id, id), eq(schema.asset.organizationId, ctx.orgId)));
}

/* -------------------------------------------------------------------------- */
/* Asset links (CMDB graph)                                                   */
/* -------------------------------------------------------------------------- */

export async function listAssetLinks(): Promise<schema.AssetLink[]> {
  const { orgId } = await requireOrg();
  return db
    .select()
    .from(schema.assetLink)
    .where(eq(schema.assetLink.organizationId, orgId));
}

export async function createAssetLink(
  fromAssetId: string,
  toAssetId: string,
  relationType = "relates-to",
): Promise<schema.AssetLink> {
  const ctx = await requireOrg();
  requireManage(ctx);
  if (fromAssetId === toAssetId) throw new Error("An asset cannot link to itself.");

  // Both endpoints must belong to the caller's org.
  const endpoints = await db
    .select({ id: schema.asset.id })
    .from(schema.asset)
    .where(
      and(
        eq(schema.asset.organizationId, ctx.orgId),
        inArray(schema.asset.id, [fromAssetId, toAssetId]),
      ),
    );
  if (endpoints.length !== 2) throw new Error("Both assets must exist in this organization.");

  const [created] = await db
    .insert(schema.assetLink)
    .values({
      id: randomUUID(),
      organizationId: ctx.orgId,
      fromAssetId,
      toAssetId,
      relationType,
    })
    .returning();
  return created;
}

export async function deleteAssetLink(id: string): Promise<void> {
  const ctx = await requireOrg();
  requireManage(ctx);
  await db
    .delete(schema.assetLink)
    .where(and(eq(schema.assetLink.id, id), eq(schema.assetLink.organizationId, ctx.orgId)));
}

/* -------------------------------------------------------------------------- */
/* Element bindings (diagram element <-> asset)                               */
/* -------------------------------------------------------------------------- */

/**
 * Bind a diagram element to an asset. Asserts the diagram and asset belong to
 * the caller's org (the diagram via its project -> workspace -> org chain).
 * Re-binding the same element replaces the previous binding.
 */
export async function bindElementToAsset(
  diagramId: string,
  elementId: string,
  assetId: string,
): Promise<schema.ElementAssetBinding> {
  const ctx = await requireOrg();
  requireManage(ctx);

  // Assert the asset is in-org.
  const [a] = await db
    .select({ id: schema.asset.id })
    .from(schema.asset)
    .where(and(eq(schema.asset.id, assetId), eq(schema.asset.organizationId, ctx.orgId)))
    .limit(1);
  if (!a) throw new Error("Asset not found in this organization.");

  // Assert the diagram is in-org via project -> workspace.
  const orgOfDiagram = await diagramOrgId(diagramId);
  if (orgOfDiagram !== ctx.orgId) throw new Error("Diagram not in this organization.");

  // Replace any existing binding for this (diagram, element).
  await db
    .delete(schema.elementAssetBinding)
    .where(
      and(
        eq(schema.elementAssetBinding.diagramId, diagramId),
        eq(schema.elementAssetBinding.elementId, elementId),
      ),
    );

  const [created] = await db
    .insert(schema.elementAssetBinding)
    .values({
      id: randomUUID(),
      organizationId: ctx.orgId,
      diagramId,
      elementId,
      assetId,
    })
    .returning();
  return created;
}

export async function unbindElement(diagramId: string, elementId: string): Promise<void> {
  const ctx = await requireOrg();
  requireManage(ctx);
  await db
    .delete(schema.elementAssetBinding)
    .where(
      and(
        eq(schema.elementAssetBinding.organizationId, ctx.orgId),
        eq(schema.elementAssetBinding.diagramId, diagramId),
        eq(schema.elementAssetBinding.elementId, elementId),
      ),
    );
}

/** Resolve the org that owns a diagram (diagram -> project -> workspace -> org). */
async function diagramOrgId(diagramId: string): Promise<string | null> {
  const rows = await db
    .select({ orgId: schema.workspace.organizationId })
    .from(schema.diagram)
    .innerJoin(schema.project, eq(schema.diagram.projectId, schema.project.id))
    .innerJoin(schema.workspace, eq(schema.project.workspaceId, schema.workspace.id))
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  return rows[0]?.orgId ?? null;
}

/* -------------------------------------------------------------------------- */
/* Grounding / impact queries                                                 */
/* -------------------------------------------------------------------------- */

export interface BoundAsset {
  elementId: string;
  asset: Asset;
  assetType: AssetType;
}

/**
 * All assets bound to elements of a diagram, with their type. Used by the
 * advisor grounding layer and as the basis for in-canvas binding UI later.
 * Strictly org-scoped via the binding's denormalized org id.
 */
export async function getDiagramBoundAssets(diagramId: string): Promise<BoundAsset[]> {
  const { orgId } = await requireOrg();
  const rows = await db
    .select({
      elementId: schema.elementAssetBinding.elementId,
      asset: schema.asset,
      assetType: schema.assetType,
    })
    .from(schema.elementAssetBinding)
    .innerJoin(schema.asset, eq(schema.elementAssetBinding.assetId, schema.asset.id))
    .innerJoin(schema.assetType, eq(schema.asset.assetTypeId, schema.assetType.id))
    .where(
      and(
        eq(schema.elementAssetBinding.diagramId, diagramId),
        eq(schema.elementAssetBinding.organizationId, orgId),
      ),
    );
  return rows;
}

export interface AssetUsage {
  diagramId: string;
  diagramName: string;
  elementId: string;
}

/**
 * Impact analysis: which diagrams/elements reference a given asset. Org-scoped.
 */
export async function getAssetUsage(assetId: string): Promise<AssetUsage[]> {
  const { orgId } = await requireOrg();
  const rows = await db
    .select({
      diagramId: schema.elementAssetBinding.diagramId,
      diagramName: schema.diagram.name,
      elementId: schema.elementAssetBinding.elementId,
    })
    .from(schema.elementAssetBinding)
    .innerJoin(schema.diagram, eq(schema.elementAssetBinding.diagramId, schema.diagram.id))
    .where(
      and(
        eq(schema.elementAssetBinding.assetId, assetId),
        eq(schema.elementAssetBinding.organizationId, orgId),
      ),
    );
  return rows;
}
