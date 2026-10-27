import { hourlyRate } from "@/lib/engine/cost";
import { remainingHours } from "@/lib/engine/progress";
import { getProjectView } from "@/lib/data/project";
import { formatMoney, formatSigned } from "@/lib/format";
import { BUDGET_CATEGORIES, BUDGET_CATEGORY_LABELS } from "@/lib/types";
import { BudgetEntries } from "@/components/projects/budget-entries";
import { MetricStrip } from "@/components/system/metric-strip";
import { Panel } from "@/components/system/panel";

export default async function ProjectBudgetPage({ params }: PageProps<"/projects/[id]/budget">) {
  const { id } = await params;
  const { project, facts, cost, snapshot, memberById, referenceDate } = await getProjectView(id);
  const { workspace } = snapshot;
  const money = (n: number) => formatMoney(n, workspace.currency);
  const etcRows = facts.tasks
    .filter((t) => remainingHours(t) > 0)
    .map((t) => {
      const rate = hourlyRate(t, memberById, workspace);
      return { task: t, hours: remainingHours(t), rate, cost: remainingHours(t) * rate, defaulted: cost.defaultRateTaskIds.includes(t.id) };
    })
    .sort((a, b) => b.cost - a.cost);
  const maxCategory = Math.max(1, ...Object.values(cost.byCategory));

  return (
    <div className="grid gap-6">
      <MetricStrip
        metrics={[
          { label: "Budget", value: money(cost.budget) },
          { label: "Actual cost (AC)", value: money(cost.actualCost), detail: cost.burnPercent !== null ? `${cost.burnPercent}% of budget` : undefined },
          { label: "Estimate to complete", value: money(cost.estimateToComplete), detail: "Remaining hours × rate" },
          { label: "Forecast at completion", value: money(cost.estimateAtCompletion), detail: "AC + estimate to complete" },
          {
            label: "Variance",
            value: cost.budget > 0 ? `${cost.variance < 0 ? "−" : "+"}${money(Math.abs(cost.variance))}` : "—",
            tone: cost.variance < 0 ? "critical" : "healthy",
            detail: cost.variancePercent !== null ? `${formatSigned(cost.variancePercent, "%")} · budget − forecast` : "Set a budget to compare",
          },
        ]}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <BudgetEntries projectId={project.id} entries={facts.budgetEntries} tasks={facts.tasks} currency={workspace.currency} defaultDate={referenceDate} />

        <div className="grid gap-6">
          <Panel title="Spend by category">
            <ul className="grid gap-2">
              {BUDGET_CATEGORIES.map((c) => (
                <li key={c} className="grid grid-cols-[5rem_1fr_6rem] items-center gap-3 text-xs">
                  <span>{BUDGET_CATEGORY_LABELS[c]}</span>
                  <span className="h-2 rounded-sm bg-secondary">
                    <span className="block h-2 rounded-sm bg-primary/70" style={{ width: `${(cost.byCategory[c] / maxCategory) * 100}%` }} />
                  </span>
                  <span className="tabular text-right">{money(cost.byCategory[c])}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Estimate to complete" description="How the remaining-work cost is calculated" bodyClassName="p-0">
            {etcRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No remaining work.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-subtle text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-medium">Task</th>
                    <th className="px-2 py-2 text-right font-medium">Hours</th>
                    <th className="px-2 py-2 text-right font-medium">Rate</th>
                    <th className="px-4 py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {etcRows.map((r) => (
                    <tr key={r.task.id}>
                      <td className="max-w-[160px] truncate px-4 py-1.5" title={r.task.title}>{r.task.title}</td>
                      <td className="tabular px-2 py-1.5 text-right">{r.hours}</td>
                      <td className="tabular px-2 py-1.5 text-right">{money(r.rate)}{r.defaulted && <span className="text-warning" title="Workspace default rate"> *</span>}</td>
                      <td className="tabular px-4 py-1.5 text-right">{money(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t px-4 py-2.5 text-[11px] leading-4 text-muted-foreground">
              Assumptions: remaining labor is costed at each owner&apos;s hourly cost{cost.defaultRateTaskIds.length ? `; * marks tasks costed at the workspace default of ${money(workspace.default_hourly_rate)}/h` : ""}. Future vendor or licence costs are not forecast — record them as they are committed.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
