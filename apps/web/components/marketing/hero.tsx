import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { CanvasPreview } from "./canvas-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* ambient hero glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[34rem] w-[60rem] max-w-full rounded-full bg-accent/10 blur-[120px]"
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <a
            href={SITE.githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="animate-rise inline-flex items-center gap-2 rounded-full border border-hairline bg-panel/60 px-3 py-1 text-xs text-fg-muted backdrop-blur transition-colors hover:text-fg"
          >
            <span className="size-1.5 rounded-full bg-success" />
            Open source · AGPL · self-hostable
          </a>

          <h1
            className="animate-rise mt-6 text-balance text-4xl font-semibold tracking-tight text-fg sm:text-6xl"
            style={{ animationDelay: "60ms" }}
          >
            Architecture diagrams that{" "}
            <span className="bg-gradient-to-r from-accent to-info bg-clip-text text-transparent">
              check themselves
            </span>
          </h1>

          <p
            className="animate-rise mx-auto mt-5 max-w-2xl text-pretty text-base text-fg-muted sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            Claril is an open-source AI architecture-intelligence workbench. Draw BPMN, Sequence,
            and C4 on a polished canvas; a deterministic inspector finds deadlocks and unreachable
            steps; and an AI co-editor documents, reviews, and edits the diagram for you.
          </p>

          <div
            className="animate-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: "180ms" }}
          >
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/sign-up">
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href={SITE.githubUrl} target="_blank" rel="noreferrer noopener">
                <Star className="size-4" /> Star on GitHub
              </a>
            </Button>
          </div>

          <p
            className="animate-rise mt-4 font-mono text-xs text-fg-subtle"
            style={{ animationDelay: "220ms" }}
          >
            Bring your own key · No vendor lock-in · Runs on your infra
          </p>
        </div>

        <div
          className="animate-rise mt-14 sm:mt-20"
          style={{ animationDelay: "260ms" }}
        >
          <CanvasPreview />
        </div>
      </div>
    </section>
  );
}
