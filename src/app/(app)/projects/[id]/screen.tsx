import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CATEGORY_CAPS, SEVERITY_POINTS } from "@/lib/engine/health";
import { daysBetween } from "@/lib/engine/dates";
import { isOpen } from "@/lib/engine/progress";
import { getActivity } from "@/lib/data/workspace";
import { getProjectView } from "@/lib/data/project";
import { formatDateTime, formatHours, formatMoney, formatShortDate } from "@/lib/format";
import { AskBar } from "@/components/copilot/ask-bar";
import { EvidenceList } from "@/components/system/evidence-list";
import { MetricStrip } from "@/components/system/metric-strip";
import { Panel } from "@/components/system/panel";
import { ProgressBar } from "@/components/system/progress-bar";
import { SourceLabel } from "@/components/system/states";
import { Pill, SeverityPill } from "@/components/system/status";
import { projectHref } from "@/lib/routes";

/** Findings shown before "Show all" on the overview (progressive disclosure). */
const FINDINGS_PREVIEW = 3;

export async function loadProjectOverview(id: string) {
  const view = await getProjectView(id);
  return { ...view, activity: await getActivity(view.project.id, 8) };
}

export function ProjectOverviewView(view: Awaited<ReturnType<typeof loadProjectOverview>>) {
  const { project, facts, progress, cost, findings, health, referenceDate, snapshot, forecastFinish, agile, activity, criticalPath } = view;
  const money = (n: number) => formatMoney(n, snapshot.workspace.currency);
  const agileProject = project.methodology === "agile";
  const slip = forecastFinish?.slipWorkingDays ?? null;

  const milestoneRisk = new Set(findings.flatMap((f) => (f.rule === "milestone_at_risk" || f.rule === "milestone_forecast_late" || f.rule === "milestone_overdue" || f.rule === "blocked_task" ? f.milestoneIds : [])));
  const openMilestones = facts.milestones.filter((m) => !m.completed_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const doneMilestones = facts.milestones.filter((m) => m.completed_at).length;
  const currentPhase = openMilestones[0];
  const shown = findings.slice(0, FINDINGS_PREVIEW);
  const hidden = findings.slice(FINDINGS_PREVIEW);

  return (
    <div className="grid gap-6">
      <MetricStrip
        metrics={[
          { label: "Progress", value: `${progress.percent}%`, detail: `${progress.doneTasks} of ${progress.totalTasks} tasks done · ${formatHours(progress.remainingHours)} left` },
          {
            label: "Forecast finish",
            value: forecastFinish?.finish ? formatShortDate(forecastFinish.finish) : forecastFinish ? "Unknown" : "Done",
            tone: slip !== null && slip > 0 ? "critical" : "healthy",
            detail: slip === null ? `Target ${formatShortDate(project.target_date)}` : slip > 0 ? `${slip} working days after the ${formatShortDate(project.target_date)} target` : `Target ${formatShortDate(project.target_date)} holds`,
          },
          {
            label: "Projected cost",
            value: money(cost.estimateAtCompletion),
            tone: cost.budget > 0 && cost.variance < 0 ? "critical" : "default",
            detail: cost.budget > 0 ? (cost.variance < 0 ? `${money(-cost.variance)} over the ${money(cost.budget)} budget` : `${money(cost.variance)} under the ${money(cost.budget)} budget`) : "No budget set",
          },
          { label: "Health", value: `${health.score}/100`, tone: health.status === "critical" ? "critical" : health.status === "at_risk" ? "warning" : "healthy", detail: `${findings.length} finding${findings.length === 1 ? "" : "s"}` },
        ]}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-6">
          {project.description && (
            <p className="max-w-3xl text-[13.5px] leading-6 text-foreground/80">{project.description}</p>
          )}

          <Panel
            title="What needs attention"
            description="Calculated from the records on the other tabs"
            actions={<Link href={`/risk?project=${project.id}`} className="text-xs font-medium text-primary hover:underline">Forecast &amp; history</Link>}
            bodyClassName="p-0"
          >
            {findings.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Nothing needs attention. Every check passes for this project.</p>
            ) : (
              <ul className="divide-y">
                {shown.map((f) => (
                  <FindingRow key={f.id} f={f} projectId={project.id} />
                ))}
                {hidden.length > 0 && (
                  <li>
                    <details className="group">
                      <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-primary hover:bg-subtle [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">Show {hidden.length} more</span>
                        <span className="hidden group-open:inline">Show fewer</span>
                      </summary>
                      <ul className="divide-y border-t">
                        {hidden.map((f) => (
                          <FindingRow key={f.id} f={f} projectId={project.id} />
                        ))}
                      </ul>
                    </details>
                  </li>
                )}
              </ul>
            )}
          </Panel>

          <AskBar
            suggestions={[
              `Can we complete ${project.name} within the remaining budget?`,
              ...(currentPhase ? [`What happens if ${currentPhase.name} is delayed by 5 days?`] : []),
              `Which tasks should I prioritize this week for ${project.name}?`,
            ]}
          />

          <Panel title="Recent activity" description="Recorded changes, newest first" bodyClassName="p-0">
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

        <div className="grid gap-6">
          {agileProject && agile ? (
            <Panel title={agile.active ? agile.active.sprint.name : "Sprints"} description={agile.active ? `${formatShortDate(agile.active.sprint.start_date)} – ${formatShortDate(agile.active.sprint.end_date)} · current sprint` : "No sprint is running today"} actions={<Link href={projectHref(project.id, "tasks")} className="text-xs font-medium text-primary hover:underline">Board</Link>}>
              {agile.active ? (
                <div className="grid gap-3">
                  {agile.active.sprint.goal && <p className="text-[13px] leading-5"><span className="text-muted-foreground">Goal: </span>{agile.active.sprint.goal}</p>}
                  <div className="flex items-center gap-3">
                    <ProgressBar value={agile.active.committedPoints ? (agile.active.completedPoints / agile.active.committedPoints) * 100 : 0} label="Sprint points completed" />
                    <span className="tabular text-xs text-muted-foreground">{agile.active.completedPoints}/{agile.active.committedPoints} pts</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">Velocity</dt><dd className="tabular font-medium">{agile.velocity ?? "Not yet known"}</dd></div>
                    <div><dt className="text-muted-foreground">Days left</dt><dd className="tabular font-medium">{Math.max(0, daysBetween(referenceDate, agile.active.sprint.end_date))}</dd></div>
                  </dl>
                  {agile.overcommit && (
                    <p className="rounded-md bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
                      {agile.overcommit.committed} points are committed against an average velocity of {agile.overcommit.velocity} ({agile.overcommit.percentOver}% over). Consider moving lower-priority items back to the backlog.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Create or schedule a sprint on the Timeline tab.</p>
              )}
            </Panel>
          ) : (
            <Panel title="Current phase" description={`${doneMilestones} of ${facts.milestones.length} phases complete`} actions={<Link href={projectHref(project.id, "timeline")} className="text-xs font-medium text-primary hover:underline">Gantt</Link>}>
              {currentPhase ? (
                <div className="grid gap-2">
                  <p className="text-[13px] font-medium">{currentPhase.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Due {formatShortDate(currentPhase.due_date)} · {facts.tasks.filter((t) => t.milestone_id === currentPhase.id && isOpen(t)).length} open tasks
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {criticalPath.taskIds.length ? `${criticalPath.taskIds.length} open tasks are on the critical path.` : criticalPath.reason}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Every phase is complete.</p>
              )}
            </Panel>
          )}

          <Panel title={agileProject ? "Upcoming releases" : "Upcoming milestones"} actions={<Link href={projectHref(project.id, "timeline")} className="text-xs font-medium text-primary hover:underline">Timeline</Link>} bodyClassName="p-0">
            {openMilestones.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing scheduled.</p>
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

          <Panel title="Budget" actions={<Link href={projectHref(project.id, "budget")} className="text-xs font-medium text-primary hover:underline">Details</Link>}>
            <div className="grid gap-2 text-xs">
              <div className="flex items-center gap-3">
                <ProgressBar value={cost.burnPercent ?? 0} tone={cost.variance < 0 ? "critical" : "primary"} label="Budget spent" />
                <span className="tabular text-muted-foreground">{cost.burnPercent ?? 0}% spent</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Spent</dt><dd className="tabular text-right">{money(cost.actualCost)}</dd>
                <dt className="text-muted-foreground">Remaining budget</dt><dd className="tabular text-right">{money(cost.budget - cost.actualCost)}</dd>
                <dt className="text-muted-foreground">Cost to complete</dt><dd className="tabular text-right">{money(cost.estimateToComplete)}</dd>
              </dl>
            </div>
          </Panel>

          <details className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
              How the health score is calculated
              <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t px-4 py-3">
              <table className="w-full text-xs">
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
                100 minus points per finding: critical {SEVERITY_POINTS.critical}, high {SEVERITY_POINTS.high}, medium {SEVERITY_POINTS.medium}, low {SEVERITY_POINTS.low}, capped per category. 75+ on track, 50–74 at risk, below 50 critical.
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function FindingRow({ f, projectId }: { f: Awaited<ReturnType<typeof loadProjectOverview>>["findings"][number]; projectId: string }) {
  return (
    <li className="grid gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityPill severity={f.severity} />
        <span className="text-[13px] font-medium">{f.title}</span>
      </div>
      {f.impact && <p className="text-xs text-foreground/80">{f.impact.label}</p>}
      <details className="group/ev">
        <summary className="cursor-pointer list-none text-xs text-primary hover:underline [&::-webkit-details-marker]:hidden">
          <span className="group-open/ev:hidden">Show evidence ({f.evidence.length})</span>
          <span className="hidden group-open/ev:inline">Hide evidence</span>
        </summary>
        <div className="mt-1.5">
          <EvidenceList evidence={f.evidence} projectId={projectId} />
        </div>
      </details>
    </li>
  );
}
