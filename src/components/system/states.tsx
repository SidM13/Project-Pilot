import { cn } from "@/lib/utils";

export function EmptyState({ title, description, action, className }: { title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed bg-subtle px-6 py-10 text-center", className)}>
      <p className="text-[13px] font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Small uppercase label used to separate facts, calculated findings and (later) AI text. */
export function SourceLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-secondary", className)} />;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-32" />
      <Skeleton className="mb-6 h-7 w-72" />
      <Skeleton className="mb-6 h-[74px] w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
