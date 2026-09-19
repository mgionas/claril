import { Skeleton } from "@/components/ui/skeleton";
import { HeadingSkeleton, ListRowsSkeleton, LoadingStatus } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <LoadingStatus label="Loading catalog" />
      <HeadingSkeleton />
      <Skeleton className="mb-2 h-9 w-full rounded-[8px]" aria-hidden />
      <ListRowsSkeleton rows={8} />
    </div>
  );
}
