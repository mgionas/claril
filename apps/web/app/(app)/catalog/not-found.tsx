import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

/**
 * Catalog route not-found boundary. Rendered when `notFound()` fires inside a
 * catalog page (e.g. a missing or cross-org asset id). It renders inside the persistent
 * (app) frame, so it only centers its card in the content area.
 */
export default function CatalogNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-[10px] border border-hairline bg-panel p-8 text-center">
        <div className="mx-auto mb-5 flex size-11 items-center justify-center rounded-full border border-hairline bg-elevated text-fg-muted">
          <SearchX className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-fg">Asset not found</h1>
        <p className="mt-2 text-sm text-fg-muted">
          This asset doesn&apos;t exist, has been deleted, or belongs to another
          organization.
        </p>
        <Link
          href="/catalog"
          className="mt-6 inline-flex items-center gap-1.5 rounded-[8px] border border-hairline bg-elevated px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-canvas"
        >
          <ArrowLeft className="size-4" />
          Back to Asset Catalog
        </Link>
      </div>
    </div>
  );
}
