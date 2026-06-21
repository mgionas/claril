import { cn } from "@/lib/utils";

/**
 * Claril wordmark — matches the in-app lockup (blue dot + name).
 * Pure markup so it can render in RSC.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="size-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]"
      />
      <span className="text-base font-semibold tracking-tight text-fg">Claril</span>
    </span>
  );
}
