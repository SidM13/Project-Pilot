"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, daysBetween } from "@/lib/engine/dates";
import { formatShortDate } from "@/lib/format";
import { STATUS_LABELS, type Methodology, type Milestone, type Sprint, type Task, type TeamMember } from "@/lib/types";
import { cn } from "@/lib/utils";

// Timeline (Gantt). Bars are the recorded plan (start → due). Optional layers:
// the baseline (approved plan), the capacity forecast where it runs past the due date,
// and the critical path. Dates come from records and the engine; nothing is estimated here.

export interface GanttProps {
  methodology: Methodology;
  tasks: Task[];
  milestones: Milestone[];
  sprints: Sprint[];
  members: TeamMember[];
  /** Forecast finish per open task id (capacity forecast). */
  forecastFinish: Record<string, string | null>;
  /** Forecast finish per milestone id. */
  milestoneForecast: Record<string, string | null>;
  criticalPathIds: string[];
  referenceDate: string;
  projectStart: string;
  projectTarget: string;
}

interface Row {
  task: Task;
  start: string | null;
  end: string | null;
  /** True when dates are taken from the sprint because the task has none. */
  inferred: boolean;
}

interface Group {
  id: string;
  title: string;
  marker?: { date: string; label: string; forecast: string | null; done: boolean };
  band?: { start: string; end: string };
  rows: Row[];
}

const DAY_PX = { week: 22, month: 8 } as const;

export function GanttChart(props: GanttProps) {
  const { tasks, milestones, sprints, methodology, referenceDate } = props;
  const [showBaseline, setShowBaseline] = useState(methodology === "waterfall");
  const [showForecast, setShowForecast] = useState(true);
  const [showCritical, setShowCritical] = useState(true);
  const [zoom, setZoom] = useState<keyof typeof DAY_PX>("week");
  const critical = useMemo(() => new Set(props.criticalPathIds), [props.criticalPathIds]);
  const memberName = useMemo(() => new Map(props.members.map((m) => [m.id, m.name])), [props.members]);
  const hasBaseline = tasks.some((t) => t.baseline_due);

  const groups: Group[] = useMemo(() => {
    const byDue = (a: Row, b: Row) => (a.start ?? "9").localeCompare(b.start ?? "9") || (a.end ?? "9").localeCompare(b.end ?? "9");
    if (methodology === "agile") {
      const out: Group[] = sprints.map((s) => ({
        id: s.id,
        title: s.name,
        band: { start: s.start_date, end: s.end_date },
        rows: tasks.filter((t) => t.sprint_id === s.id).map((t) => ({ task: t, start: t.start_date ?? s.start_date, end: t.due_date ?? s.end_date, inferred: !t.start_date || !t.due_date })).sort(byDue),
      }));
      const backlog = tasks.filter((t) => !t.sprint_id || !sprints.some((s) => s.id === t.sprint_id));
      if (backlog.length) out.push({ id: "backlog", title: "Backlog", rows: backlog.map((t) => ({ task: t, start: t.start_date, end: t.due_date, inferred: false })).sort(byDue) });
      return out;
    }
    const ordered = [...milestones].sort((a, b) => a.due_date.localeCompare(b.due_date));
    const out: Group[] = ordered.map((m, i) => ({
      id: m.id,
      title: `Phase ${i + 1} · ${m.name}`,
      marker: { date: m.due_date, label: m.name, forecast: props.milestoneForecast[m.id] ?? null, done: !!m.completed_at },
      rows: tasks.filter((t) => t.milestone_id === m.id).map((t) => ({ task: t, start: t.start_date, end: t.due_date, inferred: false })).sort(byDue),
    }));
    const loose = tasks.filter((t) => !t.milestone_id || !milestones.some((m) => m.id === t.milestone_id));
    if (loose.length) out.push({ id: "none", title: "No phase", rows: loose.map((t) => ({ task: t, start: t.start_date, end: t.due_date, inferred: false })).sort(byDue) });
    return out;
  }, [methodology, sprints, tasks, milestones, props.milestoneForecast]);

  // Visible range: every plotted date, padded to whole weeks (Mondays).
  const range = useMemo(() => {
    const dates = [props.projectStart, props.projectTarget, referenceDate];
    for (const g of groups) {
      if (g.band) dates.push(g.band.start, g.band.end);
      if (g.marker) dates.push(g.marker.date, ...(g.marker.forecast ? [g.marker.forecast] : []));
      for (const r of g.rows) {
        if (r.start) dates.push(r.start);
        if (r.end) dates.push(r.end);
        if (r.task.baseline_start) dates.push(r.task.baseline_start);
        if (r.task.baseline_due) dates.push(r.task.baseline_due);
        const f = props.forecastFinish[r.task.id];
        if (f) dates.push(f);
      }
    }
    const sorted = dates.sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const dow = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const start = addDays(first, -dow(first));
    const end = addDays(last, 6 - dow(last) + 7);
    return { start, end, days: daysBetween(start, end) + 1 };
  }, [groups, props.projectStart, props.projectTarget, referenceDate, props.forecastFinish]);

  const px = DAY_PX[zoom];
  const scroller = useRef<HTMLDivElement>(null);
  // Open with "today" in view (a week of context to its left), not at the project's first day.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, (daysBetween(range.start, referenceDate) - 7) * px);
  }, [range.start, referenceDate, px]);
  const width = range.days * px;
  const x = (d: string) => daysBetween(range.start, d) * px;
  const span = (a: string, b: string) => Math.max(px * 0.6, (daysBetween(a, b) + 1) * px);
  const weeks = Array.from({ length: Math.ceil(range.days / 7) }, (_, i) => addDays(range.start, i * 7));

  return (
    <div className="min-w-0 rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-2.5">
        <Toggle on={showForecast} set={setShowForecast} label="Forecast overrun" />
        <Toggle on={showCritical} set={setShowCritical} label="Critical path" disabled={!props.criticalPathIds.length} />
        <Toggle on={showBaseline} set={setShowBaseline} label="Baseline" disabled={!hasBaseline} />
        <div role="radiogroup" aria-label="Zoom" className="ml-auto flex rounded-md border p-0.5 text-xs">
          {(["week", "month"] as const).map((z) => (
            <button key={z} type="button" role="radio" aria-checked={zoom === z} onClick={() => setZoom(z)} className={cn("rounded-[4px] px-2 py-0.5", zoom === z ? "bg-secondary font-medium" : "text-muted-foreground")}>
              {z === "week" ? "Weeks" : "Months"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Task names (sticky column) */}
        <div className="w-56 shrink-0 border-r sm:w-72">
          <div className="h-9 border-b bg-subtle px-3 text-xs leading-9 text-muted-foreground">Task</div>
          {groups.map((g) => (
            <div key={g.id}>
              <div className="flex h-8 items-center truncate border-b bg-subtle/60 px-3 text-xs font-semibold">{g.title}</div>
              {g.rows.map((r) => (
                <div key={r.task.id} className="flex h-9 items-center gap-2 border-b px-3">
                  <span className={cn("truncate text-[12.5px]", r.task.status === "done" && "text-muted-foreground line-through")} title={r.task.title}>{r.task.title}</span>
                  {showCritical && critical.has(r.task.id) && <span aria-label="On the critical path" className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Chart */}
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width }}>
            {/* Week header */}
            <div className="flex h-9 border-b bg-subtle">
              {weeks.map((w, i) => (
                <div key={w} className="shrink-0 border-r border-border/70 px-1.5 text-[10.5px] leading-9 text-muted-foreground" style={{ width: 7 * px }}>
                  {zoom === "week" || i % 4 === 0 ? formatShortDate(w) : ""}
                </div>
              ))}
            </div>
            {/* Today + target lines */}
            <div aria-hidden className="pointer-events-none absolute top-9 bottom-0 w-px bg-primary/70" style={{ left: x(referenceDate) }} />
            <div aria-hidden className="pointer-events-none absolute top-0 h-9 -translate-x-1/2 px-1 text-[10px] leading-9 font-semibold text-primary" style={{ left: x(referenceDate) }}>Today</div>
            <div aria-hidden className="pointer-events-none absolute top-9 bottom-0 border-l border-dashed border-foreground/40" style={{ left: x(props.projectTarget) + px }} />

            {groups.map((g) => (
              <div key={g.id}>
                <div className="relative h-8 border-b bg-subtle/60">
                  {g.band && <div className="absolute top-2 h-4 rounded-sm bg-primary/10 ring-1 ring-primary/25" style={{ left: x(g.band.start), width: span(g.band.start, g.band.end) }} title={`${g.title}: ${formatShortDate(g.band.start)} – ${formatShortDate(g.band.end)}`} />}
                  {g.marker && (
                    <>
                      <Diamond left={x(g.marker.date) + px / 2} tone={g.marker.done ? "done" : "plan"} title={`${g.marker.label}: due ${formatShortDate(g.marker.date)}`} />
                      {showForecast && g.marker.forecast && g.marker.forecast > g.marker.date && !g.marker.done && (
                        <Diamond left={x(g.marker.forecast) + px / 2} tone="late" title={`${g.marker.label}: forecast ${formatShortDate(g.marker.forecast)}`} />
                      )}
                    </>
                  )}
                </div>
                {g.rows.map((r) => {
                  const t = r.task;
                  const f = props.forecastFinish[t.id];
                  const late = showForecast && t.status !== "done" && !!r.end && !!f && f > r.end;
                  const owner = t.assignee_id ? memberName.get(t.assignee_id) : "Unassigned";
                  return (
                    <div key={t.id} className="relative h-9 border-b">
                      {showBaseline && t.baseline_start && t.baseline_due && (
                        <div className="absolute bottom-1 h-1 rounded-full bg-foreground/25" style={{ left: x(t.baseline_start), width: span(t.baseline_start, t.baseline_due) }} title={`Baseline ${formatShortDate(t.baseline_start)} – ${formatShortDate(t.baseline_due)}`} />
                      )}
                      {r.start && r.end ? (
                        <div
                          className={cn(
                            "absolute top-2 flex h-4 items-center overflow-hidden rounded-[4px] px-1.5 text-[10px] font-medium whitespace-nowrap",
                            t.status === "done" ? "bg-healthy/70 text-white" : t.status === "blocked" ? "bg-critical/80 text-white" : t.status === "in_progress" ? "bg-primary/80 text-white" : "bg-primary/25 text-foreground",
                            r.inferred && "opacity-60",
                            showCritical && critical.has(t.id) && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                          )}
                          style={{ left: x(r.start), width: span(r.start, r.end) }}
                          title={`${t.title} · ${STATUS_LABELS[t.status]} · ${owner} · ${formatShortDate(r.start)} – ${formatShortDate(r.end)}${r.inferred ? " (sprint dates)" : ""}${f ? ` · forecast finish ${formatShortDate(f)}` : ""}`}
                        >
                          {zoom === "week" && daysBetween(r.start, r.end) > 3 ? owner : ""}
                        </div>
                      ) : (
                        <span className="absolute top-2.5 left-2 text-[10.5px] text-muted-foreground">No dates</span>
                      )}
                      {late && (
                        <div
                          className="absolute top-2 h-4 rounded-r-[4px] border border-l-0 border-critical/60 bg-[repeating-linear-gradient(135deg,var(--critical-soft),var(--critical-soft)_3px,transparent_3px,transparent_6px)]"
                          style={{ left: x(r.end!) + px, width: Math.max(px, daysBetween(r.end!, f!) * px) }}
                          title={`Forecast to finish ${formatShortDate(f)}, after the ${formatShortDate(r.end)} due date`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[3px] bg-primary/25" /> Planned (start → due)</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[3px] bg-primary/80" /> In progress</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[3px] bg-healthy/70" /> Done</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[3px] bg-critical/80" /> Blocked</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[3px] border border-critical/60 bg-[repeating-linear-gradient(135deg,var(--critical-soft),var(--critical-soft)_3px,transparent_3px,transparent_6px)]" /> Forecast past due</li>
        {hasBaseline && <li className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-foreground/25" /> Baseline</li>}
        <li className="flex items-center gap-1.5"><span className="size-2 rotate-45 bg-foreground/70" /> Milestone</li>
        <li className="flex items-center gap-1.5"><span className="h-3 border-l border-dashed border-foreground/50" /> Target date</li>
      </ul>
    </div>
  );
}

function Toggle({ on, set, label, disabled }: { on: boolean; set: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center gap-1.5 text-xs", disabled ? "text-muted-foreground/60" : "text-muted-foreground")}>
      <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={on && !disabled} disabled={disabled} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );
}

function Diamond({ left, tone, title }: { left: number; tone: "plan" | "late" | "done"; title: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn("absolute top-2.5 size-3 -translate-x-1/2 rotate-45 rounded-[2px]", tone === "plan" ? "bg-foreground/75" : tone === "done" ? "bg-healthy" : "border-2 border-critical bg-card")}
      style={{ left }}
    />
  );
}
