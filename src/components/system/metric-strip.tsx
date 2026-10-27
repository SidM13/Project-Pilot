import { cn } from "@/lib/utils";

export interface Metric {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "default" | "critical" | "warning" | "healthy";
}

const VALUE_TONE = { default: "", critical: "text-critical", warning: "text-warning", healthy: "text-healthy" };

/** A single bordered row of compact figures — used instead of oversized KPI cards. */
export function MetricStrip({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 overflow-hidden rounded-lg border bg-card sm:grid-cols-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]", className)} style={{ "--cols": metrics.length } as React.CSSProperties}>
      {metrics.map((m) => (
        <div key={m.label} className="border-b border-r px-4 py-3 last:border-r-0 lg:border-b-0">
          <dt className="text-xs text-muted-foreground">{m.label}</dt>
          <dd className={cn("tabular mt-1 text-xl font-semibold tracking-tight", VALUE_TONE[m.tone ?? "default"])}>{m.value}</dd>
          {m.detail && <dd className="mt-0.5 text-xs text-muted-foreground">{m.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}
