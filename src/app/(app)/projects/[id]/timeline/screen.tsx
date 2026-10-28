import Link from "next/link";
import { daysBetween } from "@/lib/engine/dates";
import { baselineVariance } from "@/lib/engine/planning";
import { isOpen, remainingHours } from "@/lib/engine/progress";
import { getProjectView } from "@/lib/data/project";
import { formatShortDate } from "@/lib/format";
import { BaselineButton } from "@/components/projects/baseline-button";
import { GanttChart } from "@/components/projects/gantt-chart";
import { MilestoneList } from "@/components/projects/milestone-list";
import { SprintManager } from "@/components/projects/sprint-manager";
import { MetricStrip } from "@/components/system/metric-strip";
import { Panel } from "@/components/system/panel";
import { TaskStatusPill } from "@/components/system/status";
import { projectHref } from "@/lib/routes";

export async function loadProjectTimeline(id: string) {
  return getProjectView(id);
}

export function ProjectTimelineView(view: Awaited<ReturnType<typeof loadProjectTimeline>>) {
  const { project, facts, findings, referenceDate, snapshot, workspaceAnalysis, forecastFinish, criticalPath, agile, sprints } = view;
  const plan = workspaceAnalysis.forecast;
  const agileProject = project.methodology === "agile";
  const taskById = new Map(facts.tasks.map((t) => [t.id, t]));

  const atRisk = new Set(findings.filter((f) => f.rule === "milestone_at_risk" || f.rule === "milestone_forecast_late" || f.rule === "blocked_task").flatMap((f) => f.milestoneIds));
  const milestoneRows = [...facts.milestones]
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((m) => {
      const linked = facts.tasks.filter((t) => t.milestone_id === m.id && isOpen(t));
      return { milestone: m, openTasks: linked.length, remainingHours: Math.round(linked.reduce((s, t) => s + remainingHours(t), 0) * 10) / 10, daysUntil: daysBetween(referenceDate, m.due_date), atRisk: atRisk.has(m.id) };
    });

  const variances = facts.tasks.filter((t) => t.baseline_due).map((t) => ({ task: t, v: baselineVariance(t, plan) }));
  const slipped = variances.filter((x) => (x.v.finishVariance ?? 0) > 0);
  const hasBaseline = variances.length > 0;
  const forecastFinishes = Object.fromEntries(facts.tasks.map((t) => [t.id, plan.tasks.get(t.id)?.finish ?? null]));
  const milestoneForecast = Object.fromEntries(facts.milestones.map((m) => [m.id, plan.milestones.get(m.id)?.finish ?? null]));
  const slip = forecastFinish?.slipWorkingDays ?? null;

  const openEdges = facts.dependencies.filter((d) => {
    const up = taskById.get(d.depends_on_id);
    const down = taskById.get(d.task_id);
    return up && down && isOpen(up) && isOpen(down);
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <MetricStrip
        metrics={[
          { label: "Target date", value: formatShortDate(project.target_date), detail: `${Math.max(0, daysBetween(referenceDate, project.target_date))} calendar days away` },
          {
            label: "Forecast finish",
            value: forecastFinish?.finish ? formatShortDate(forecastFinish.finish) : forecastFinish ? "Unknown" : "Done",
            tone: slip !== null && slip > 0 ? "critical" : "healthy",
            detail: slip === null ? "From capacity and estimates" : slip > 0 ? `${slip} working days late` : "Target holds",
          },
          agileProject && agile
            ? { label: "Velocity", value: agile.velocity ?? "—", detail: agile.sprintsToFinish !== null ? `${agile.openPoints} open points ≈ ${agile.sprintsToFinish} sprints` : "Known after the first sprint" }
            : { label: "Critical path", value: criticalPath.taskIds.length ? `${criticalPath.taskIds.length} tasks` : "—", detail: criticalPath.taskIds.length ? "Open chain setting the finish" : "Needs dependencies" },
          agileProject && agile
            ? { label: "Current sprint", value: agile.active ? `${agile.active.committedPoints} pts` : "None", tone: agile.overcommit ? "warning" : "default", detail: agile.overcommit ? `${agile.overcommit.percentOver}% above velocity` : agile.active ? agile.active.sprint.name : "Create or schedule a sprint" }
            : { label: "Against baseline", value: hasBaseline ? `${slipped.length} late` : "No baseline", tone: slipped.length ? "warning" : "default", detail: hasBaseline ? `of ${variances.length} baselined tasks` : "Save the plan to track drift" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{agileProject ? "Sprints and releases" : "Gantt chart"}</h2>
          <p className="text-xs text-muted-foreground">
            {agileProject ? "Tasks grouped by sprint; tasks without dates are drawn across their sprint." : "Tasks grouped by phase; each phase ends at its milestone."} Bars are the recorded plan; the hatched extension is the capacity forecast where it runs past the due date.
          </p>
        </div>
        {!agileProject && <BaselineButton projectId={project.id} hasBaseline={hasBaseline} />}
      </div>

      {facts.tasks.length === 0 ? (
        <Panel><p className="py-6 text-center text-[13px] text-muted-foreground">Add tasks with dates on the <Link href={projectHref(project.id, "tasks")} className="text-primary hover:underline">Tasks</Link> tab to see the timeline.</p></Panel>
      ) : (
        <GanttChart
          methodology={project.methodology}
          tasks={facts.tasks}
          milestones={facts.milestones}
          sprints={sprints}
          members={snapshot.members}
          forecastFinish={forecastFinishes}
          milestoneForecast={milestoneForecast}
          criticalPathIds={criticalPath.taskIds}
          referenceDate={referenceDate}
          projectStart={project.start_date}
          projectTarget={project.target_date}
        />
      )}

      {!agileProject && (
        <Panel title="Critical path" description={criticalPath.reason ?? "The chain of open work that sets the forecast finish. A delay to any of these tasks delays the project."} bodyClassName="p-0">
          {criticalPath.taskIds.length > 0 && (
            <ol className="divide-y">
              {criticalPath.taskIds.map((id, i) => {
                const t = taskById.get(id)!;
                const f = plan.tasks.get(id)?.finish ?? null;
                return (
                  <li key={id}>
                    <Link href={projectHref(project.id, "tasks", `task-${id}`)} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                      <span className="tabular w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.title}</span>
                      <TaskStatusPill status={t.status} />
                      <span className="tabular text-xs text-muted-foreground">due {formatShortDate(t.due_date)} · forecast {formatShortDate(f)}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="grid gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">{agileProject ? "Releases" : "Phases and milestones"}</h2>
          <MilestoneList projectId={project.id} rows={milestoneRows} noun={agileProject ? "release" : "milestone"} />
        </section>
        {agileProject && agile ? (
          <section className="grid gap-3">
            <h2 className="text-[15px] font-semibold tracking-tight">Sprints</h2>
            <SprintManager projectId={project.id} agile={agile} referenceDate={referenceDate} />
          </section>
        ) : (
          <section className="grid gap-3">
            <h2 className="text-[15px] font-semibold tracking-tight">Baseline variance</h2>
            <Panel bodyClassName="p-0">
              {!hasBaseline ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No baseline yet. Use “Set baseline” to save today&apos;s plan, then drift is tracked here.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-subtle text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-medium">Task</th>
                      <th className="px-2 py-2 font-medium">Baseline due</th>
                      <th className="px-2 py-2 font-medium">Finish</th>
                      <th className="px-4 py-2 text-right font-medium">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {variances
                      .sort((a, b) => (b.v.finishVariance ?? -999) - (a.v.finishVariance ?? -999))
                      .map(({ task, v }) => (
                        <tr key={task.id}>
                          <td className="max-w-[200px] truncate px-4 py-1.5" title={task.title}>{task.title}</td>
                          <td className="tabular px-2 py-1.5">{formatShortDate(v.baselineDue)}</td>
                          <td className="tabular px-2 py-1.5">
                            {v.finishBasis === "actual" ? `${formatShortDate(task.completed_at)} (done)` : v.finishBasis === "forecast" ? `${formatShortDate(plan.tasks.get(task.id)?.finish)} (forecast)` : "—"}
                          </td>
                          <td className={(v.finishVariance ?? 0) > 0 ? "tabular px-4 py-1.5 text-right font-medium text-critical" : "tabular px-4 py-1.5 text-right text-muted-foreground"}>
                            {v.finishVariance === null ? "—" : v.finishVariance > 0 ? `+${v.finishVariance} wd` : v.finishVariance < 0 ? `${v.finishVariance} wd` : "on baseline"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </section>
        )}
      </div>

      <Panel title="Dependencies" description="Open work waiting on other open work. Add or remove them in each task's details." bodyClassName="p-0">
        {openEdges.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No open dependencies.</p>
        ) : (
          <ul className="divide-y">
            {openEdges.map((d) => {
              const up = taskById.get(d.depends_on_id)!;
              const down = taskById.get(d.task_id)!;
              return (
                <li key={`${d.task_id}-${d.depends_on_id}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 text-[13px]">
                  <Link href={projectHref(project.id, "tasks", `task-${up.id}`)} className="flex min-w-0 items-center gap-2 hover:underline">
                    <TaskStatusPill status={up.status} />
                    <span className="truncate">{up.title}</span>
                  </Link>
                  <span aria-label="must finish before" className="text-xs text-muted-foreground">→</span>
                  <Link href={projectHref(project.id, "tasks", `task-${down.id}`)} className="flex min-w-0 items-center gap-2 hover:underline">
                    <TaskStatusPill status={down.status} />
                    <span className="truncate">{down.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
