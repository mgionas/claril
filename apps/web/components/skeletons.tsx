import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** Page title + subtitle placeholder. */
export function HeadingSkeleton() {
  return (
    <div className="mb-6 flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-[10px]" />
      ))}
    </div>
  );
}

export function CardSkeleton({ className = "h-48" }: { className?: string }) {
  return <Skeleton className={cn("rounded-[10px]", className)} aria-hidden />;
}

export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-[8px]" />
      ))}
    </div>
  );
}

/** Screen-reader announcement shared by every loading.tsx. */
export function LoadingStatus({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}
