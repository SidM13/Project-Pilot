import { taskCosts } from "@/lib/engine/planning";
import { getProjectView } from "@/lib/data/project";
import { formatMoney, formatSigned } from "@/lib/format";
import { BUDGET_CATEGORIES, BUDGET_CATEGORY_LABELS } from "@/lib/types";
import { BudgetEntries } from "@/components/projects/budget-entries";
import { MetricStrip } from "@/components/system/metric-strip";
import { Panel } from "@/components/system/panel";
import { Pill } from "@/components/system/status";

export async function loadProjectBudget(id: string) {
  return getProjectView(id);
}

export function ProjectBudgetView({ project, facts, cost, snapshot, memberById, referenceDate, findings }: Awaited<ReturnType<typeof loadProjectBudget>>) {
  const { workspace } = snapshot;
  const money = (n: number) => formatMoney(n, workspace.currency);
  const remainingBudget = cost.budget - cost.actualCost;
  const overrun = findings.find((f) => f.rule === "budget_overrun");
  const headroom = findings.find((f) => f.rule === "budget_headroom");
  const costs = taskCosts(facts.tasks, facts.budgetEntries, memberById, workspace);
  const taskById = new Map(facts.tasks.map((t) => [t.id, t]));
  const rows = costs.filter((c) => c.plannedCost > 0 || c.recordedCost > 0).sort((a, b) => b.costToComplete - a.costToComplete || b.plannedCost - a.plannedCost);
  const totals = rows.reduce((s, r) => ({ planned: s.planned + r.plannedCost, recorded: s.recorded + r.recordedCost, etc: s.etc + r.costToComplete }), { planned: 0, recorded: 0, etc: 0 });
  const labor = cost.byCategory.labor;
  const maxCategory = Math.max(1, ...Object.values(cost.byCategory));
  const anyDefault = rows.some((r) => r.defaultRate && r.costToComplete > 0);

  return (
    <div className="grid gap-6">
      <MetricStrip
        metrics={[
          { label: "Planned budget", value: money(cost.budget) },
          { label: "Actual spending", value: money(cost.actualCost), detail: cost.burnPercent !== null ? `${cost.burnPercent}% of budget` : "Recorded entries" },
          { label: "Remaining budget", value: money(remainingBudget), tone: remainingBudget < 0 ? "critical" : "default", detail: "Budget − actual spending" },
          { label: "Projected completion cost", value: money(cost.estimateAtCompletion), detail: `Actual + ${money(cost.estimateToComplete)} to complete` },
          {
            label: "Variance",
            value: cost.budget > 0 ? `${cost.variance < 0 ? "−" : "+"}${money(Math.abs(cost.variance))}` : "—",
            tone: cost.variance < 0 ? "critical" : headroom ? "warning" : "healthy",
            detail: cost.variancePercent !== null ? `${formatSigned(cost.variancePercent, "%")} of budget (budget − projected)` : "Set a budget to compare",
          },
        ]}
      />

      {(overrun || headroom) && (
        <div className={overrun ? "rounded-lg border border-critical/25 bg-critical-soft px-4 py-3" : "rounded-lg border border-warning/25 bg-warning-soft px-4 py-3"}>
          <p className={overrun ? "text-[13px] font-medium text-critical" : "text-[13px] font-medium text-warning"}>{(overrun ?? headroom)!.title}</p>
          {(overrun ?? headroom)!.impact && <p className="mt-0.5 text-xs text-foreground/80">{(overrun ?? headroom)!.impact!.label}</p>}
        </div>
      )}

      <Panel title="Cost by task" description="Planned cost = planned hours × owner's hourly cost. Cost to complete = remaining hours × the same rate." bodyClassName="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No tasks with hours yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-xs">
              <thead className="bg-subtle text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                  <th className="px-3 py-2 text-right font-medium">Planned cost</th>
                  <th className="px-3 py-2 text-right font-medium">Recorded to task</th>
                  <th className="px-4 py-2 text-right font-medium">Cost to complete</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const t = taskById.get(r.taskId)!;
                  return (
                    <tr key={r.taskId}>
                      <td className="max-w-[280px] truncate px-4 py-1.5" title={t.title}>
                        {t.title}
                        {t.status === "done" && <span className="text-muted-foreground"> · done</span>}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{t.assignee_id ? memberById.get(t.assignee_id)?.name : <span className="text-muted-foreground">Unassigned</span>}</td>
                      <td className="tabular px-3 py-1.5 text-right">{money(r.rate)}{r.defaultRate && <span className="text-warning" title="Workspace default rate"> *</span>}</td>
                      <td className="tabular px-3 py-1.5 text-right">{money(r.plannedCost)}</td>
                      <td className="tabular px-3 py-1.5 text-right">{r.recordedCost ? money(r.recordedCost) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="tabular px-4 py-1.5 text-right font-medium">{r.costToComplete ? money(r.costToComplete) : <span className="font-normal text-muted-foreground">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-subtle font-medium">
                <tr>
                  <td className="px-4 py-2" colSpan={3}>Total</td>
                  <td className="tabular px-3 py-2 text-right">{money(totals.planned)}</td>
                  <td className="tabular px-3 py-2 text-right">{money(totals.recorded)}</td>
                  <td className="tabular px-4 py-2 text-right">{money(totals.etc)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="border-t px-4 py-2.5 text-[11px] leading-4 text-muted-foreground">
          Labor recorded as spend so far: {money(labor)}. Only spend entries count as actual cost — logged hours measure effort, not money.
          {anyDefault && ` * Costed at the workspace default of ${money(workspace.default_hourly_rate)}/h (no owner or no hourly cost).`} Future vendor or software costs are included once recorded.
        </p>
      </Panel>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <BudgetEntries projectId={project.id} entries={facts.budgetEntries} tasks={facts.tasks} currency={workspace.currency} defaultDate={referenceDate} />
        <Panel title="Spend by category" actions={cost.defaultRateTaskIds.length ? <Pill tone="warning">{cost.defaultRateTaskIds.length} at default rate</Pill> : undefined}>
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
      </div>
    </div>
  );
}
