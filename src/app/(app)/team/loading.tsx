import { Skeleton } from "@/components/system/states";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-32" />
      <Skeleton className="mb-6 h-7 w-56" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
