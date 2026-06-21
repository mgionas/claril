"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react";

/**
 * Catalog route error boundary (Next.js convention). Catches render/data errors
 * thrown by catalog pages — including the no-organization case (`requireOrg()`
 * throws) — and shows a friendly, on-brand fallback instead of an unstyled 500.
 *
 * Renders outside AppShell, so it carries its own minimal centered chrome from
 * the shared dark tokens. Raw error internals are never surfaced; we only show a
 * short, safe message.
 */
export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console for diagnostics without leaking it into the UI.
    console.error("Catalog route error:", error);
  }, [error]);

  const message =
    error.message === "No organization."
      ? "You aren't a member of any organization yet. Create or join one to use the Asset Catalog."
      : "The Asset Catalog couldn't be loaded. This is usually temporary.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-md rounded-[10px] border border-hairline bg-panel p-8 text-center">
        <div className="mx-auto mb-5 flex size-11 items-center justify-center rounded-full border border-hairline bg-elevated text-warning">
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-fg">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-fg-muted">{message}</p>
        <div className="mt-6 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <RotateCw className="size-4" />
            Try again
          </button>
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-hairline bg-elevated px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-canvas"
          >
            <ArrowLeft className="size-4" />
            Asset Catalog
          </Link>
        </div>
      </div>
    </main>
  );
}
