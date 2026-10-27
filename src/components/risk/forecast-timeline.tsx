import { daysBetween } from "@/lib/engine/dates";
import type { Forecast } from "@/lib/engine";
import { formatShortDate } from "@/lib/format";
import type { Task, TeamMember } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Forecast schedule of open tasks as horizontal bars on a shared date axis.
 * Bars are the engine's forecast start–finish; the tick marks each task's due date.
 */
export function ForecastTimeline({ tasks, forecast, members, referenceDate, target }: { tasks: Task[]; forecast: Forecast; members: Map<string, TeamMember>; referenceDate: string; target: string }) {
  const rows = tasks
    .map((t) => ({ t, f: forecast.tasks.get(t.id) }))
    .filter((r): r is { t: Task; f: NonNullable<typeof r.f> } => !!r.f?.start && !!r.f.finish)
    .sort((a, b) => a.f.start!.localeCompare(b.f.start!) || a.f.finish!.localeCompare(b.f.finish!));
  if (!rows.length) return <p className="py-6 text-center text-xs text-muted-foreground">No open work to forecast.</p>;

  const end = [target, ...rows.map((r) => r.f.finish!), ...rows.flatMap((r) => (r.t.due_date ? [r.t.due_date] : []))].sort().at(-1)!;
  const span = Math.max(1, daysBetween(referenceDate, end) + 1);
  const pos = (d: string) => `${(Math.max(0, daysBetween(referenceDate, d)) / span) * 100}%`;
  const width = (a: string, b: string) => `${Math.max(0.8, ((daysBetween(a, b) + 1) / span) * 100)}%`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[220px_1fr] border-b pb-1.5 text-[11px] text-muted-foreground">
          <span>Task · owner</span>
          <span className="relative h-4">
            <span className="absolute left-0">{formatShortDate(referenceDate)}</span>
            <span className="absolute -translate-x-1/2" style={{ left: pos(target) }}>Target {formatShortDate(target)}</span>
            <span className="absolute right-0">{formatShortDate(end)}</span>
          </span>
        </div>
        <ul className="divide-y">
          {rows.map(({ t, f }) => {
            const late = !!t.due_date && f.finish! > t.due_date;
            return (
              <li key={t.id} className="grid grid-cols-[220px_1fr] items-center gap-0 py-1.5 text-xs">
                <span className="truncate pr-3" title={`${t.title} — ${t.assignee_id ? members.get(t.assignee_id)?.name : "Unassigned"}`}>
                  <span className={cn(t.is_critical && "font-medium")}>{t.title}</span>
                  <span className="text-muted-foreground"> · {t.assignee_id ? members.get(t.assignee_id)?.name.split(" ")[0] : "—"}</span>
                </span>
                <span className="relative h-4" aria-label={`${t.title}: forecast ${formatShortDate(f.start)} to ${formatShortDate(f.finish)}${t.due_date ? `, due ${formatShortDate(t.due_date)}` : ""}`} role="img">
                  <span aria-hidden className="absolute inset-y-0 w-px bg-foreground/25" style={{ left: pos(target) }} />
                  <span
                    className={cn("absolute top-1 h-2 rounded-sm", t.status === "blocked" ? "bg-critical/70" : late ? "bg-warning" : "bg-primary/60")}
                    style={{ left: pos(f.start!), width: width(f.start!, f.finish!) }}
                  />
                  {t.due_date && <span aria-hidden className="absolute top-0 h-4 w-0.5 bg-foreground" style={{ left: pos(t.due_date) }} />}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-primary/60 align-middle" />Forecast on time</span>
          <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-warning align-middle" />Finishes after its due date</span>
          <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-critical/70 align-middle" />Blocked</span>
          <span><span className="mr-1 inline-block h-3 w-0.5 bg-foreground align-middle" />Due date</span>
        </p>
      </div>
    </div>
  );
}
