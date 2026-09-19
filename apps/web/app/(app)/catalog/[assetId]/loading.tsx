import { CardSkeleton, HeadingSkeleton, LoadingStatus } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingStatus label="Loading" />
      <HeadingSkeleton />
      <CardSkeleton className="h-56" />
      <CardSkeleton className="h-40" />
    </div>
  );
}
