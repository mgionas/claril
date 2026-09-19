import { HeadingSkeleton, ListRowsSkeleton, LoadingStatus } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <LoadingStatus label="Loading projects" />
      <HeadingSkeleton />
      <ListRowsSkeleton rows={6} />
    </div>
  );
}
