import type { HealthStatus, Severity } from "@/lib/engine";
import { STATUS_LABELS, type TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE = {
  critical: "bg-critical-soft text-critical border-critical/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  healthy: "bg-healthy-soft text-healthy border-healthy/20",
  info: "bg-info-soft text-primary border-primary/15",
  neutral: "bg-secondary text-muted-foreground border-border",
} as const;
export type Tone = keyof typeof TONE;

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

const SEVERITY_TONE: Record<Severity, Tone> = { critical: "critical", high: "warning", medium: "neutral", low: "neutral" };
const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

export function SeverityPill({ severity }: { severity: Severity }) {
  return <Pill tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Pill>;
}

export const HEALTH_LABEL: Record<HealthStatus, string> = { on_track: "On track", at_risk: "At risk", critical: "Critical" };
const HEALTH_TONE: Record<HealthStatus, Tone> = { on_track: "healthy", at_risk: "warning", critical: "critical" };

export function HealthPill({ status, score }: { status: HealthStatus; score?: number }) {
  return (
    <Pill tone={HEALTH_TONE[status]}>
      {score !== undefined && <span className="tabular font-semibold">{score}</span>}
      {HEALTH_LABEL[status]}
    </Pill>
  );
}

const TASK_TONE: Record<TaskStatus, Tone> = { todo: "neutral", in_progress: "info", blocked: "critical", done: "healthy" };

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return <Pill tone={TASK_TONE[status]}>{STATUS_LABELS[status]}</Pill>;
}

/** Thin left rule used to mark severity on list rows. */
export function severityRule(severity: Severity) {
  return severity === "critical" ? "before:bg-critical" : severity === "high" ? "before:bg-warning" : "before:bg-input";
}
