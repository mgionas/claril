import Link from "next/link";
import { ArrowUpRight, Server } from "lucide-react";
import { Button } from "@/components/ui/button";

const GITHUB_URL = "https://github.com/";

const points = [
  {
    title: "AGPL licensed",
    description: "Read the source, fork it, contribute back. No black boxes in your toolchain.",
  },
  {
    title: "Run on your infra",
    description: "Self-host the full workbench. Diagrams and metadata never leave your network.",
  },
  {
    title: "Bring your own key",
    description: "Inference goes straight to your provider with your credentials — no middleman.",
  },
];

export function OpenSourceBand() {
  return (
    <section
      id="open-source"
      className="scroll-mt-20 border-t border-hairline bg-panel/30 py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-elevated px-3 py-1 font-mono text-xs text-fg-muted">
              <Server className="size-3.5 text-accent" aria-hidden />
              Your infra · your data · your keys
            </span>
            <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Open source and self-hostable by design
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-base text-fg-muted">
              Claril is built for teams that can&apos;t hand their architecture to a SaaS. Everything
              runs where you run it, AI included.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="outline">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
                  View on GitHub <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/docs/self-hosting">Self-hosting guide</Link>
              </Button>
            </div>
          </div>

          <ul className="grid gap-px overflow-hidden rounded-[10px] border border-hairline bg-hairline">
            {points.map(({ title, description }) => (
              <li key={title} className="bg-canvas p-5">
                <h3 className="text-sm font-semibold text-fg">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{description}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
