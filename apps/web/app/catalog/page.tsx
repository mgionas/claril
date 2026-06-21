import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Library } from "lucide-react";
import { auth } from "@/lib/auth";
import { getActiveContext } from "@/lib/context";
import { listAssetTypes, listAssets, getAssetUsageCounts } from "@/lib/catalog-actions";
import { AppShell } from "@/components/app-shell";
import { CatalogAdmin } from "@/components/catalog-admin";

/**
 * Asset Catalog — org-level CMDB (asset types + assets). Wrapped in the shared
 * AppShell; the listing is a type-filtered table with usage counts and links to
 * each asset's detail page (/catalog/[assetId]).
 *
 * Org-only: the catalog is unified org knowledge, so in the personal scope we
 * render a "not available" state and never fetch org data.
 */
export default async function CatalogPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const ctx = await getActiveContext();

  if (ctx?.kind !== "org") {
    return (
      <AppShell active="catalog" userName={session.user.name} userEmail={session.user.email}>
        <div className="flex h-full w-full items-center justify-center p-8">
          <div className="w-full max-w-md rounded-[10px] border border-border bg-card/60 p-8 text-center backdrop-blur">
            <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-[10px] border border-border bg-muted/40">
              <Library className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <h2 className="text-base font-medium text-foreground">
              Asset Catalog isn&apos;t available in your personal space
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The catalog is an organization feature — a unified, shared inventory of asset
              types and assets. Switch to or create an organization using the context switcher
              in the top-left to get started.
            </p>
          </div>
        </div>
      </AppShell>
    );
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
