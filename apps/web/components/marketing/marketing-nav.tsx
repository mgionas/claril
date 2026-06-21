import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "./wordmark";

const GITHUB_URL = "https://github.com/";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/70 backdrop-blur-xl">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link
          href="/"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Claril home"
        >
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#how-it-works">How it works</NavLink>
          <NavLink href="#open-source">Open source</NavLink>
          <NavLink href="/docs">Docs</NavLink>
          <NavLink href={GITHUB_URL} external>
            GitHub
            <ArrowUpRight className="size-3.5" aria-hidden />
          </NavLink>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
