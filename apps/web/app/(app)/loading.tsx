import {
  CardSkeleton,
  HeadingSkeleton,
  ListRowsSkeleton,
  LoadingStatus,
  StatCardsSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingStatus label="Loading dashboard" />
      <HeadingSkeleton />
      <StatCardsSkeleton />
      <div className="grid gap-4 md:grid-cols-2">
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-64" />
      </div>
      <ListRowsSkeleton rows={4} />
    </div>
  );
}
