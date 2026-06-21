import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "@/components/marketing/wordmark";
import { SITE } from "@/lib/site";
import { DocsSidebar } from "./_components/sidebar";

export const metadata: Metadata = {
  title: {
    default: "Docs",
    template: "%s · Claril Docs",
  },
  description: "Documentation for Claril — the open-source architecture & process intelligence workbench.",
};

/**
 * Public docs chrome (no auth). Frosted top bar + a sticky sidebar listing the
 * docs pages, with content rendered at a comfortable reading width.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Claril home"
            >
              <Wordmark />
            </Link>
            <span className="font-mono text-xs uppercase tracking-widest text-fg-subtle">Docs</span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
            >
              Home
            </Link>
            <a
              href={SITE.githubUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
            >
              GitHub
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[14rem_1fr] lg:py-14">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <DocsSidebar />
        </aside>
        <main className="min-w-0 max-w-2xl">{children}</main>
      </div>
    </div>
  );
}
