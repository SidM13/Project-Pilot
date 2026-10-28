import { cn } from "@/lib/utils";

/** Thin horizontal progress bar (0–100). `label` is announced to assistive technology. */
export function ProgressBar({ value, label, tone = "primary", className }: { value: number; label: string; tone?: "primary" | "critical" | "warning" | "healthy"; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = { primary: "bg-primary/75", critical: "bg-critical", warning: "bg-warning", healthy: "bg-healthy" }[tone];
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className={cn("relative block h-1.5 flex-1 overflow-hidden rounded-full bg-secondary", className)}>
      <span className={cn("absolute inset-y-0 left-0 rounded-full", fill)} style={{ width: `${pct}%` }} />
    </span>
  );
}
