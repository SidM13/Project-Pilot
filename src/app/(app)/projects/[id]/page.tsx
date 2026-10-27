import Link from "next/link";
import { CATEGORY_CAPS, SEVERITY_POINTS } from "@/lib/engine/health";
import { daysBetween } from "@/lib/engine/dates";
import { isOpen, remainingHours } from "@/lib/engine/progress";
import { getActivity } from "@/lib/data/workspace";
import { getProjectView } from "@/lib/data/project";
import { formatDateTime, formatHours, formatMoney, formatShortDate, formatSigned } from "@/lib/format";
import { EvidenceList } from "@/components/system/evidence-list";
import { MetricStrip } from "@/components/system/metric-strip";
import { Panel } from "@/components/system/panel";
import { SourceLabel } from "@/components/system/states";
import { Pill, SeverityPill, TaskStatusPill } from "@/components/system/status";

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const view = await getProjectView(id);
  const { project, facts, progress, schedule, cost, findings, health, memberById, referenceDate, snapshot, forecastFinish } = view;
  const currency = snapshot.workspace.currency;
  const activity = await getActivity(project.id, 6);
  const taskById = new Map(facts.tasks.map((t) => [t.id, t]));
  const owner = (mid: string | null) => (mid ? (memberById.get(mid)?.name ?? "Unknown") : "Unassigned");

  const milestoneRisk = new Set(findings.flatMap((f) => (f.rule === "milestone_at_risk" || f.rule === "milestone_forecast_late" || f.rule === "milestone_overdue" || f.rule === "blocked_task" ? f.milestoneIds : [])));
  const openMilestones = facts.milestones.filter((m) => !m.completed_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const criticalTasks = facts.tasks.filter((t) => t.is_critical && isOpen(t)).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
  const openEdges = facts.dependencies.filter((d) => {
    const up = taskById.get(d.depends_on_id);
    const down = taskById.get(d.task_id);
    return up && down && isOpen(up) && isOpen(down);
  });

  return (
    <div className="grid gap-6">
      <MetricStrip
        metrics={[
          { label: "Progress", value: `${progress.percent}%`, detail: `${formatHours(progress.earnedHours)} of ${formatHours(progress.plannedHours)} planned` },
          {
            label: "Schedule variance",
            value: formatSigned(schedule.variancePoints, " pts"),
            tone: schedule.variancePoints < -10 ? "warning" : "default",
            detail: `${schedule.expectedPercent}% of schedule elapsed`,
          },
          { label: "Forecast cost", value: formatMoney(cost.estimateAtCompletion, currency), detail: `Budget ${formatMoney(cost.budget, currency)}` },
          {
            label: "Budget variance",
            value: cost.budget > 0 ? `${cost.variance < 0 ? "−" : "+"}${formatMoney(Math.abs(cost.variance), currency)}` : "—",
            tone: cost.variance < 0 ? "critical" : "default",
            detail: cost.variancePercent !== null ? `${formatSigned(cost.variancePercent, "%")} of budget` : "No budget set",
          },
          { label: "Spent to date", value: formatMoney(cost.actualCost, currency), detail: cost.burnPercent !== null ? `${cost.burnPercent}% of budget` : undefined },
          {
            label: "Forecast finish",
            value: forecastFinish?.finish ? formatShortDate(forecastFinish.finish) : "—",
            tone: (forecastFinish?.slipWorkingDays ?? 0) > 0 ? "critical" : "default",
            detail: forecastFinish?.slipWorkingDays == null ? `Target ${formatShortDate(project.target_date)}` : forecastFinish.slipWorkingDays > 0 ? `${forecastFinish.slipWorkingDays} wd after ${formatShortDate(project.target_date)} target` : `Target ${formatShortDate(project.target_date)} held`,
          },
        ]}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6">
          <Panel
            title="Calculated findings"
            description="Produced by the rules in docs/calculations.md from the records on the other tabs"
            actions={<Link href={`/risk?project=${project.id}`} className="text-xs font-medium text-primary hover:underline">Forecast &amp; history</Link>}
            bodyClassName="p-0"
          >
            {findings.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No findings. Every rule passes for this project.</p>
            ) : (
              <ul className="divide-y">
                {findings.map((f) => (
                  <li key={f.id} className="grid gap-2 px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityPill severity={f.severity} />
                      <span className="text-[13px] font-medium">{f.title}</span>
                    </div>
                    {f.impact && <p className="text-xs text-foreground/80">{f.impact.label}</p>}
                    <EvidenceList evidence={f.evidence} projectId={project.id} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Dependencies" description="Open work waiting on other open work" bodyClassName="p-0">
            {openEdges.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No open dependencies. Add them from the Tasks tab.</p>
            ) : (
              <ul className="divide-y">
                {openEdges.map((d) => {
                  const up = taskById.get(d.depends_on_id)!;
                  const down = taskById.get(d.task_id)!;
                  return (
                    <li key={`${d.task_id}-${d.depends_on_id}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 text-[13px]">
                      <Link href={`/projects/${project.id}/tasks#task-${up.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                        <TaskStatusPill status={up.status} />
                        <span className="truncate">{up.title}</span>
                      </Link>
                      <span aria-label="blocks" className="text-xs text-muted-foreground">→</span>
                      <Link href={`/projects/${project.id}/tasks#task-${down.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
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

        <div className="grid gap-6">
          <Panel title="Health score" description="100 minus capped penalties per category">
            <div className="flex items-baseline gap-2">
              <span className="tabular text-3xl font-semibold tracking-tight">{health.score}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <table className="mt-3 w-full text-xs">
              <tbody className="divide-y">
                {(Object.keys(CATEGORY_CAPS) as (keyof typeof CATEGORY_CAPS)[]).map((c) => {
                  const p = health.penalties.find((x) => x.category === c);
                  return (
                    <tr key={c}>
                      <td className="py-1.5 capitalize">{c}</td>
                      <td className="py-1.5 text-muted-foreground">{p ? `${p.findingIds.length} finding${p.findingIds.length === 1 ? "" : "s"}` : "—"}</td>
                      <td className="tabular py-1.5 text-right">
                        {p ? `−${p.points}` : "0"}
                        {p && p.rawPoints > p.points && <span className="text-muted-foreground"> (cap {CATEGORY_CAPS[c]})</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
              Points per finding: critical {SEVERITY_POINTS.critical}, high {SEVERITY_POINTS.high}, medium {SEVERITY_POINTS.medium}, low {SEVERITY_POINTS.low}. 75+ on track, 50–74 at risk, below 50 critical.
            </p>
          </Panel>

          <Panel title="Upcoming milestones" actions={<Link href={`/projects/${project.id}/milestones`} className="text-xs font-medium text-primary hover:underline">All</Link>} bodyClassName="p-0">
            {openMilestones.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No open milestones.</p>
            ) : (
              <ul className="divide-y">
                {openMilestones.slice(0, 5).map((m) => {
                  const days = daysBetween(referenceDate, m.due_date);
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="tabular w-12 shrink-0 font-mono text-xs text-muted-foreground">{formatShortDate(m.due_date)}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{m.name}</span>
                      {days < 0 ? <Pill tone="critical">{-days} d late</Pill> : milestoneRisk.has(m.id) ? <Pill tone="warning">At risk</Pill> : <span className="text-xs text-muted-foreground">in {days} d</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Critical tasks" description="Open tasks marked critical" bodyClassName="p-0">
            {criticalTasks.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No open critical tasks.</p>
            ) : (
              <ul className="divide-y">
                {criticalTasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/projects/${project.id}/tasks#task-${t.id}`} className="grid gap-0.5 px-4 py-2.5 hover:bg-subtle">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px]">{t.title}</span>
                        <TaskStatusPill status={t.status} />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {owner(t.assignee_id)} · due {formatShortDate(t.due_date)} · {formatHours(remainingHours(t))} left
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" actions={<Link href={`/projects/${project.id}/activity`} className="text-xs font-medium text-primary hover:underline">All</Link>} bodyClassName="p-0">
            <div className="px-4 pt-3"><SourceLabel>Facts · recorded changes</SourceLabel></div>
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No changes recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {activity.map((e) => (
                  <li key={e.id} className="px-4 py-2.5">
                    <p className="text-[13px] leading-5">{e.summary}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDateTime(e.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
