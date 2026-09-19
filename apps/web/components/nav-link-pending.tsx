"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small spinner shown inside a <Link> while its navigation is pending, so the
 * clicked item itself signals "working" before the next route's skeleton appears.
 * Must be rendered as a descendant of a `next/link` <Link>.
 */
export function NavLinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <Loader2
      className={cn("ml-auto size-3.5 shrink-0 animate-spin text-fg-muted", className)}
      aria-label="Loading"
    />
  );
}
