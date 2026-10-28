import Link from "next/link";
import { OVERLOAD_THRESHOLD_PERCENT } from "@/lib/engine/capacity";
import { teamConflicts, type ConflictKind } from "@/lib/engine/planning";
import { hourlyRate } from "@/lib/engine/cost";
import { isOpen, remainingHours } from "@/lib/engine/progress";
import { getProjectView } from "@/lib/data/project";
import { formatHours, formatMoney, formatShortDate } from "@/lib/format";
import { AssignSelect } from "@/components/projects/assign-select";
import { MemberDialog } from "@/components/team/member-dialog";
import { MetricStrip } from "@/components/system/metric-strip";
import { Panel } from "@/components/system/panel";
import { ProgressBar } from "@/components/system/progress-bar";
import { Pill } from "@/components/system/status";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/routes";

export async function loadProjectTeam(id: string) {
  return getProjectView(id);
}

const CONFLICT_LABEL: Record<ConflictKind, string> = {
  overallocated: "Overallocated",
  starts_before_upstream_due: "Date clash",
  inactive_owner: "Inactive owner",
  forecast_after_due: "Will miss due date",
};

export function ProjectTeamView({ project, facts, snapshot, workspaceAnalysis, memberById }: Awaited<ReturnType<typeof loadProjectTeam>>) {
  const { workspace } = snapshot;
  const money = (n: number) => formatMoney(n, workspace.currency);
  const loads = new Map(workspaceAnalysis.loads.map((l) => [l.memberId, l]));
  const open = facts.tasks.filter(isOpen);
  const memberIds = [...new Set([project.owner_member_id, ...facts.tasks.map((t) => t.assignee_id)].filter((x): x is string => !!x))];
  const people = memberIds
    .map((id) => memberById.get(id))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => {
      const own = open.filter((t) => t.assignee_id === m.id);
      const hours = own.reduce((s, t) => s + remainingHours(t), 0);
      return { member: m, own, hours, cost: own.reduce((s, t) => s + remainingHours(t) * hourlyRate(t, memberById, workspace), 0), load: loads.get(m.id) };
    })
    .sort((a, b) => (b.load?.loadPercent ?? 0) - (a.load?.loadPercent ?? 0));
  const conflicts = teamConflicts(facts.tasks, facts.dependencies, memberById, workspaceAnalysis.loads, workspaceAnalysis.forecast);
  const unassigned = open.filter((t) => !t.assignee_id);
  const over = people.filter((p) => (p.load?.loadPercent ?? 0) > OVERLOAD_THRESHOLD_PERCENT);
  const disciplines = [...new Set(snapshot.members.map((m) => m.discipline).filter(Boolean))].sort();
  const w = workspaceAnalysis.window;

  return (
    <div className="grid gap-6">
      <MetricStrip
        metrics={[
          { label: "People on this project", value: people.length, detail: project.owner_member_id ? `Led by ${memberById.get(project.owner_member_id)?.name}` : "No project owner" },
          { label: "Overallocated", value: over.length, tone: over.length ? "critical" : "healthy", detail: `Above ${OVERLOAD_THRESHOLD_PERCENT}% in the next 10 working days` },
          { label: "Scheduling conflicts", value: conflicts.length, tone: conflicts.length ? "warning" : "healthy", detail: "Clashes, late forecasts, inactive owners" },
          { label: "Labor cost to complete", value: money(people.reduce((s, p) => s + p.cost, 0) + unassigned.reduce((s, t) => s + remainingHours(t) * hourlyRate(t, memberById, workspace), 0)), detail: "Remaining hours × hourly cost" },
        ]}
      />

      <Panel
        title="Workload"
        description={`Load counts work across all projects, ${formatShortDate(w.start)}–${formatShortDate(w.end)}. The bar's marker is 100% of capacity.`}
        actions={
          <>
            <MemberDialog disciplines={disciplines} addLabel="Add person" />
            <Link href="/team" className="text-xs font-medium text-primary hover:underline">All people</Link>
          </>
        }
        bodyClassName="p-0"
      >
        {people.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Nobody is assigned yet. Assign owners below or in each task.</p>
        ) : (
          <ul className="divide-y">
            {people.map(({ member: m, own, hours, cost, load }) => {
              const pct = load?.loadPercent ?? 0;
              const tone = pct > OVERLOAD_THRESHOLD_PERCENT ? "critical" : pct > 85 ? "warning" : "primary";
              return (
                <li key={m.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[13px] font-medium">
                      {m.name}
                      {project.owner_member_id === m.id && <Pill tone="info">Project owner</Pill>}
                      {!m.active && <Pill>Inactive</Pill>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.role_title || "No role"} · {m.weekly_capacity_hours} h/wk · {m.hourly_cost !== null ? `${money(m.hourly_cost)}/h` : "default rate"}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <ProgressBar value={Math.min(100, pct) * 0.8} tone={tone} label={`${m.name}: ${pct}% of capacity`} className="h-2" />
                        <span aria-hidden className="absolute top-[-2px] left-[80%] h-3 w-px bg-foreground/40" />
                      </div>
                      <span className={cn("tabular w-12 text-right text-xs", pct > OVERLOAD_THRESHOLD_PERCENT && "font-semibold text-critical")}>{pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This project: {own.length} open task{own.length === 1 ? "" : "s"}, {formatHours(hours)} remaining ({money(cost)})
                      {load ? ` · all projects: ${load.assignedHours} of ${load.capacityHours} h in the window` : ""}
                    </p>
                  </div>
                  <MemberDialog member={m} disciplines={disciplines} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Panel title="Scheduling conflicts" description="Calculated from assignments, dependencies and the capacity forecast" bodyClassName="p-0">
          {conflicts.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No conflicts. Everyone fits, and every dated task is forecast to finish on time.</p>
          ) : (
            <ul className="divide-y">
              {conflicts.map((c, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <Pill tone={c.kind === "overallocated" || c.kind === "forecast_after_due" ? "critical" : "warning"}>{CONFLICT_LABEL[c.kind]}</Pill>
                  {c.taskId ? (
                    <Link href={projectHref(project.id, "tasks", `task-${c.taskId}`)} className="text-xs leading-5 hover:underline">{c.detail}</Link>
                  ) : (
                    <span className="text-xs leading-5">{c.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Assign work" description={unassigned.length ? `${unassigned.length} open task${unassigned.length === 1 ? " has" : "s have"} no owner` : "Change owners of open tasks"} bodyClassName="p-0">
          <ul className="divide-y">
            {(unassigned.length ? unassigned : open.slice().sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9")).slice(0, 8)).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">{formatHours(remainingHours(t))} left · due {formatShortDate(t.due_date)}</span>
                </span>
                <AssignSelect taskId={t.id} taskTitle={t.title} value={t.assignee_id} members={snapshot.members} />
              </li>
            ))}
            {open.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">No open tasks.</li>}
          </ul>
          <p className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">Changing an owner re-runs the forecast and cost for every project that person works on. To compare options first, use What-if in the AI Copilot.</p>
        </Panel>
      </div>
    </div>
  );
}
