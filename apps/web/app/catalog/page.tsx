import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listAssetTypes, listAssets } from "@/lib/catalog-actions";
import { CatalogAdmin } from "@/components/catalog-admin";

/**
 * Asset Catalog admin — org-level CMDB management (asset types + assets).
 * Self-contained route; does not collide with project/diagram routes.
 */
export default async function CatalogPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const [types, assets] = await Promise.all([listAssetTypes(), listAssets()]);

  return <CatalogAdmin initialTypes={types} initialAssets={assets} />;
}
