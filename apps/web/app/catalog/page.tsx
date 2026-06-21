import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listAssetTypes, listAssets, getAssetUsageCounts } from "@/lib/catalog-actions";
import { AppShell } from "@/components/app-shell";
import { CatalogAdmin } from "@/components/catalog-admin";

/**
 * Asset Catalog — org-level CMDB (asset types + assets). Wrapped in the shared
 * AppShell; the listing is a type-filtered table with usage counts and links to
 * each asset's detail page (/catalog/[assetId]).
 */
export default async function CatalogPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const [types, assets, usageCounts] = await Promise.all([
    listAssetTypes(),
    listAssets(),
    getAssetUsageCounts(),
  ]);

  return (
    <AppShell active="catalog" userName={session.user.name} userEmail={session.user.email}>
      <CatalogAdmin initialTypes={types} initialAssets={assets} usageCounts={usageCounts} />
    </AppShell>
  );
}
