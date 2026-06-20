import { and, eq } from "drizzle-orm";
import { db, schema, type FieldDef } from "@claril/db";
import type { AssetContext, GroundedAsset, GroundedField } from "@claril/ai-advisor";

/**
 * Build the advisor {@link AssetContext} for a diagram: every element-bound
 * asset, flattened with its custom fields and outgoing references. This is the
 * thin integration point between the Asset Catalog and the advisor — it does
 * NOT touch advisor internals, it only produces the optional grounding input.
 *
 * Strictly org-scoped: the caller passes the resolved org id.
 */
export async function buildDiagramAssetContext(
  orgId: string,
  diagramId: string,
): Promise<AssetContext> {
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

  if (rows.length === 0) return { assets: [] };

  // Resolve reference targets (asset names) in one batch for the whole diagram.
  const assetIds = rows.map((r) => r.asset.id);
  const links =
    assetIds.length > 0
      ? await db
          .select()
          .from(schema.assetLink)
          .where(eq(schema.assetLink.organizationId, orgId))
      : [];
  const nameById = new Map<string, string>();
  for (const r of rows) nameById.set(r.asset.id, r.asset.name);
  // Backfill names for link targets not directly bound.
  const unknownTargets = links
    .map((l) => l.toAssetId)
    .filter((id) => !nameById.has(id));
  if (unknownTargets.length > 0) {
    const extra = await db
      .select({ id: schema.asset.id, name: schema.asset.name })
      .from(schema.asset)
      .where(eq(schema.asset.organizationId, orgId));
    for (const e of extra) nameById.set(e.id, e.name);
  }

  const assets: GroundedAsset[] = rows.map((r) => {
    const fieldSchema = (r.assetType.fieldSchema ?? []) as FieldDef[];
    const values = (r.asset.values ?? {}) as Record<string, unknown>;
    const fields: GroundedField[] = fieldSchema.map((f) => ({
      label: f.label,
      value: formatValue(values[f.key]),
    }));
    const references = links
      .filter((l) => l.fromAssetId === r.asset.id)
      .map((l) => ({
        relationType: l.relationType,
        targetName: nameById.get(l.toAssetId) ?? l.toAssetId,
      }));
    return {
      elementId: r.elementId,
      typeName: r.assetType.name,
      name: r.asset.name,
      description: r.asset.description ?? undefined,
      fields,
      references: references.length > 0 ? references : undefined,
    };
  });

  return { assets };
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
