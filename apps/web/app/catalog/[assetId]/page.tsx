import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Asset, AssetLink, FieldDef } from "@claril/db";
import { auth } from "@/lib/auth";
import {
  getAsset,
  listAssetTypes,
  listAssets,
  listAssetLinks,
  getAssetUsage,
  canManageCatalog,
} from "@/lib/catalog-actions";
import { AppShell } from "@/components/app-shell";
import { AssetDetail } from "@/components/catalog/asset-detail";

/**
 * Asset item detail page — the deep-link target for every catalog row. Shows the
 * asset's fields (formatted by FieldType), its CMDB links, and an impact-analysis
 * "Used in" list of the diagrams/elements that reference it. Org-scoped via the
 * catalog actions; missing/cross-org assets resolve to notFound().
 */
export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const asset = await getAsset(assetId);
  if (!asset) notFound();

  const [types, allAssets, allLinks, usage, canManage] = await Promise.all([
    listAssetTypes(),
    listAssets(),
    listAssetLinks(),
    getAssetUsage(assetId),
    canManageCatalog(),
  ]);

  const assetType = types.find((t) => t.id === asset.assetTypeId) ?? null;
  const byId = new Map<string, Asset>(allAssets.map((a) => [a.id, a]));

  // Reference-field targets that we can resolve to a name/link.
  const schema = (assetType?.fieldSchema as FieldDef[] | undefined) ?? [];
  const values = (asset.values as Record<string, unknown>) ?? {};
  const referencedIds = new Set<string>();
  for (const f of schema) {
    if (f.type === "reference") {
      const v = values[f.key];
      if (typeof v === "string" && v) referencedIds.add(v);
    }
  }

  // CMDB links touching this asset, with the other endpoint resolved in-org.
  const links = allLinks
    .filter((l: AssetLink) => l.fromAssetId === assetId || l.toAssetId === assetId)
    .map((link: AssetLink) => {
      const direction = link.fromAssetId === assetId ? ("out" as const) : ("in" as const);
      const otherId = direction === "out" ? link.toAssetId : link.fromAssetId;
      const other = byId.get(otherId) ?? null;
      if (other) referencedIds.add(other.id);
      return { link, other, direction };
    });

  const referenced = [...referencedIds]
    .map((id) => byId.get(id))
    .filter((a): a is Asset => Boolean(a));

  return (
    <AppShell active="catalog" userName={session.user.name} userEmail={session.user.email}>
      <AssetDetail
        asset={asset}
        assetType={assetType}
        usage={usage}
        links={links}
        referenced={referenced}
        canManage={canManage}
      />
    </AppShell>
  );
}
