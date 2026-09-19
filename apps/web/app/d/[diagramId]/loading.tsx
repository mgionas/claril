import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Full-screen workbench placeholder while a diagram's data loads. */
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline px-4" aria-hidden>
        <Skeleton className="size-6" />
        <Skeleton className="h-4 w-48" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="size-8" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center" role="status">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="size-4 animate-spin" />
          Opening diagram…
        </div>
      </div>
    </div>
  );
}
