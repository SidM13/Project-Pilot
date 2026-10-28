import Link from "next/link";
import type { MemberLoad, WorkspaceAnalysis } from "@/lib/engine";
import { daysBetween } from "@/lib/engine/dates";
import { formatShortDate } from "@/lib/format";
import { Panel } from "@/components/system/panel";
import { Pill } from "@/components/system/status";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/routes";

export function UpcomingDeadlines({ analysis }: { analysis: WorkspaceAnalysis }) {
  const names = new Map(analysis.projects.map((p) => [p.project.id, p.project.name]));
  return (
    <Panel title="Upcoming deadlines" description="Milestones and critical tasks due in the next 14 days" bodyClassName="p-0">
      {analysis.deadlines.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing critical is due in the next 14 days.</p>
      ) : (
        <ul className="divide-y">
          {analysis.deadlines.map((d) => (
            <li key={`${d.kind}-${d.id}`}>
              <Link
                href={d.kind === "milestone" ? projectHref(d.projectId, "timeline", `milestone-${d.id}`) : projectHref(d.projectId, "tasks", `task-${d.id}`)}
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-subtle"
              >
                <span className="tabular w-12 shrink-0 pt-px font-mono text-xs text-muted-foreground">{formatShortDate(d.dueDate)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    {d.kind === "milestone" && <span className="mr-1 text-muted-foreground">◆</span>}
                    {d.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {names.get(d.projectId)} · in {daysBetween(analysis.referenceDate, d.dueDate)} d
                  </span>
                </span>
                {d.atRisk && <Pill tone="warning">At risk</Pill>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TeamLoad({ loads, window }: { loads: MemberLoad[]; window: WorkspaceAnalysis["window"] }) {
  const rows = [...loads].sort((a, b) => b.loadPercent - a.loadPercent);
  return (
    <Panel
      title="Team workload"
      description={`Assigned remaining hours vs capacity, ${formatShortDate(window.start)}–${formatShortDate(window.end)}`}
      actions={<Link href="/team" className="text-xs font-medium text-primary hover:underline">People</Link>}
    >
      {rows.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground">Add team members to see capacity.</p>
      ) : (
        <ul className="grid gap-2.5">
          {rows.map((l) => {
            const over = l.loadPercent > 100;
            return (
              <li key={l.memberId} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-xs">
                <span className="truncate" title={l.name}>{l.name}</span>
                <span className="relative h-2 overflow-hidden rounded-sm bg-secondary" role="img" aria-label={`${l.name}: ${l.loadPercent}% of capacity`}>
                  <span className={cn("absolute inset-y-0 left-0 rounded-sm", over ? "bg-critical" : l.loadPercent > 85 ? "bg-warning" : "bg-primary/70")} style={{ width: `${Math.min(100, l.loadPercent) * 0.8}%` }} />
                  {/* 100% capacity marker sits at 80% of the track so overload remains visible */}
                  <span aria-hidden className="absolute inset-y-0 left-[80%] w-px bg-foreground/40" />
                  {over && <span className="absolute inset-y-0 rounded-r-sm bg-critical/60" style={{ left: "80%", width: `${Math.min(20, (l.loadPercent - 100) * 0.8)}%` }} />}
                </span>
                <span className={cn("tabular text-right", over && "font-semibold text-critical")}>{l.loadPercent}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
