import { Skeleton } from "@/components/system/states";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-6">
      <Skeleton className="h-[74px] w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
