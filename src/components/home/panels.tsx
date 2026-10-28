import Link from "next/link";
import type { ProjectAnalysis } from "@/lib/engine";
import { BUDGET_WARN_PERCENT } from "@/lib/engine/planning-labels";
import { formatMoney, formatShortDate } from "@/lib/format";
import { METHODOLOGY_LABELS } from "@/lib/types";
import { Panel } from "@/components/system/panel";
import { HealthPill, Pill } from "@/components/system/status";
import { ProgressBar } from "@/components/system/progress-bar";
import { projectHref } from "@/lib/routes";

function finishText(p: ProjectAnalysis) {
  const f = p.forecastFinish;
  if (!f) return "All work done";
  if (!f.finish) return "Finish date unknown";
  if (f.slipWorkingDays !== null && f.slipWorkingDays > 0) return `Forecast ${formatShortDate(f.finish)} · ${f.slipWorkingDays} working days late`;
  return `Forecast ${formatShortDate(f.finish)} · on time`;
}

/** Every active project at a glance: health, methodology, progress and forecast finish. */
export function ProjectsOverview({ projects }: { projects: ProjectAnalysis[] }) {
  const rows = [...projects].sort((a, b) => a.health.score - b.health.score);
  return (
    <Panel title="Projects" description="Least healthy first" actions={<Link href="/projects" className="text-xs font-medium text-primary hover:underline">All projects</Link>} bodyClassName="p-0">
      <ul className="divide-y">
        {rows.map((p) => {
          const late = (p.forecastFinish?.slipWorkingDays ?? 0) > 0 || (p.forecastFinish && !p.forecastFinish.finish);
          return (
            <li key={p.project.id}>
              <Link href={projectHref(p.project.id)} className="grid gap-2 px-4 py-3 hover:bg-subtle sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center sm:gap-4">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">{p.project.name}</span>
                    <Pill>{METHODOLOGY_LABELS[p.project.methodology]}</Pill>
                  </span>
                  <span className={late ? "mt-0.5 block text-xs text-critical" : "mt-0.5 block text-xs text-muted-foreground"}>{finishText(p)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <ProgressBar value={p.progress.percent} label={`${p.project.name}: ${p.progress.percent}% complete`} />
                  <span className="tabular w-9 text-right text-xs text-muted-foreground">{p.progress.percent}%</span>
                </span>
                <HealthPill status={p.health.status} score={p.health.score} />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Projects forecast to overrun, or with less than BUDGET_WARN_PERCENT headroom. */
export function BudgetWatch({ projects, currency }: { projects: ProjectAnalysis[]; currency: string }) {
  const money = (n: number) => formatMoney(n, currency);
  const rows = projects
    .filter((p) => p.cost.budget > 0 && (p.cost.variance < 0 || (p.cost.variancePercent ?? 100) < BUDGET_WARN_PERCENT))
    .sort((a, b) => a.cost.variance - b.cost.variance);
  return (
    <Panel title="Budget warnings" description={`Forecast overruns, or under ${BUDGET_WARN_PERCENT}% headroom`} bodyClassName="p-0">
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Every project is forecast to finish with at least {BUDGET_WARN_PERCENT}% of its budget to spare.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((p) => {
            const over = p.cost.variance < 0;
            return (
              <li key={p.project.id}>
                <Link href={projectHref(p.project.id, "budget")} className="flex items-start gap-3 px-4 py-2.5 hover:bg-subtle">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{p.project.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      Projected {money(p.cost.estimateAtCompletion)} of {money(p.cost.budget)}
                    </span>
                  </span>
                  <Pill tone={over ? "critical" : "warning"}>{over ? `${money(-p.cost.variance)} over` : `${money(p.cost.variance)} left`}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
