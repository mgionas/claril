import { CardSkeleton, HeadingSkeleton, LoadingStatus } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <LoadingStatus label="Loading workspaces" />
      <HeadingSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}
