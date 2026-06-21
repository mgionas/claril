import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

const GITHUB_URL = "https://github.com/";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-hairline py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-72 w-[48rem] max-w-full rounded-full bg-accent/15 blur-[120px]"
      />
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-fg sm:text-5xl">
          Start with diagrams that check themselves
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-fg-muted">
          Create a free account, or clone the repo and run it on your own infrastructure today.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/sign-up">
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
              <Star className="size-4" /> Star on GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
