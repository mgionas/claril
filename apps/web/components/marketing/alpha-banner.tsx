"use client";

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { SITE } from "@/lib/site";

/**
 * Slim, dismissible alpha notice rendered above the marketing nav.
 * Client component only so the local dismiss state works — no persistence.
 */
export function AlphaBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative border-b border-hairline bg-accent/10 text-fg">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-x-2 gap-y-1 px-10 py-2 text-center text-xs sm:text-[13px]">
        <p className="text-pretty text-fg-muted">
          Claril is in alpha — we&apos;re building in the open and would love your feedback.{" "}
          <a
            href={SITE.feedbackUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
          >
            Share feedback
            <ArrowRight className="size-3" aria-hidden />
          </a>
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss alpha notice"
        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-elevated hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
