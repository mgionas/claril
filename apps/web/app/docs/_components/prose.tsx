import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight typographic primitives for the docs section. We don't ship the
 * Tailwind typography plugin, so these compose the shared design tokens into a
 * clean, dark-first reading experience that matches the marketing surface.
 */

export function DocHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
}) {
  return (
    <header className="mb-10">
      {eyebrow ? (
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{eyebrow}</p>
      ) : null}
      <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        {title}
      </h1>
      {intro ? (
        <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-fg-muted">{intro}</p>
      ) : null}
    </header>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-12 scroll-mt-24 text-pretty text-xl font-semibold tracking-tight text-fg"
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-8 text-base font-semibold text-fg">{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-pretty text-sm leading-relaxed text-fg-muted">{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-4 space-y-2 pl-5 text-sm leading-relaxed text-fg-muted marker:text-fg-subtle [&>li]:list-disc">
      {children}
    </ul>
  );
}

export function Ol({ children }: { children: ReactNode }) {
  return (
    <ol className="mt-4 space-y-2 pl-5 text-sm leading-relaxed text-fg-muted marker:text-fg-subtle [&>li]:list-decimal">
      {children}
    </ol>
  );
}

export function Li({ children }: { children: ReactNode }) {
  return <li className="pl-1">{children}</li>;
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-hairline bg-elevated px-1.5 py-0.5 font-mono text-[0.8125em] text-fg">
      {children}
    </code>
  );
}

export function CodeBlock({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[10px] border border-hairline bg-panel/40 backdrop-blur">
      {title ? (
        <div className="border-b border-hairline px-4 py-2 font-mono text-[11px] text-fg-subtle">
          {title}
        </div>
      ) : null}
      <pre className="overflow-x-auto px-4 py-3.5">
        <code className="font-mono text-[12.5px] leading-relaxed text-fg-muted [&_b]:font-semibold [&_b]:text-fg">
          {children}
        </code>
      </pre>
    </div>
  );
}

export function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "accent" | "warn";
  children: ReactNode;
}) {
  const tones = {
    info: "border-hairline bg-panel/40",
    accent: "border-accent/30 bg-accent/5",
    warn: "border-warning/30 bg-warning/5",
  } as const;
  return (
    <div className={cn("mt-6 rounded-[10px] border px-4 py-3 text-sm leading-relaxed text-fg-muted", tones[tone])}>
      {children}
    </div>
  );
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="font-medium text-accent underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}
