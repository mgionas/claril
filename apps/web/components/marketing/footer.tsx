import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "./wordmark";

const GITHUB_URL = "https://github.com/";

const columns: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] =
  [
    {
      heading: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "How it works", href: "#how-it-works" },
        { label: "Open source", href: "#open-source" },
        { label: "Get started", href: "/sign-up" },
      ],
    },
    {
      heading: "Resources",
      links: [
        { label: "Docs", href: "/docs" },
        { label: "Self-hosting", href: "/docs/self-hosting" },
        { label: "CLI & MCP", href: "/docs/cli" },
        { label: "GitHub", href: GITHUB_URL, external: true },
      ],
    },
    {
      heading: "Account",
      links: [
        { label: "Sign in", href: "/sign-in" },
        { label: "Sign up", href: "/sign-up" },
      ],
    },
  ];

export function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.5fr_2fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
            Open-source AI architecture-intelligence workbench. Draw, inspect, and let AI edit —
            on your own infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((col) => (
            <div key={col.heading}>
              <h3 className="font-mono text-xs uppercase tracking-widest text-fg-subtle">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
                      >
                        {link.label}
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-fg-muted transition-colors hover:text-fg"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-fg-subtle sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Claril. AGPL-3.0 licensed.</p>
          <p className="font-mono">claril.dev</p>
        </div>
      </div>
    </footer>
  );
}
