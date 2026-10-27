import type { PlanMetrics, SimulationResult } from "@/lib/engine/simulate";
import { formatMoney, formatShortDate } from "@/lib/format";
import { Panel } from "@/components/system/panel";
import { SourceLabel } from "@/components/system/states";
import { HealthPill, Pill } from "@/components/system/status";
import { cn } from "@/lib/utils";

const slipText = (s: number | null) => (s == null ? "Unknown" : s > 0 ? `${s} wd late` : s === 0 ? "On target" : `${-s} wd early`);

/** Better = lower for slip, cost, risk; higher for variance and health. */
function Delta({ before, after, lowerIsBetter, format }: { before: number | null; after: number | null; lowerIsBetter: boolean; format: (n: number) => string }) {
  if (before == null || after == null || before === after) return <span className="text-muted-foreground">No change</span>;
  const diff = after - before;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return <span className={cn("tabular font-medium", better ? "text-healthy" : "text-critical")}>{diff > 0 ? "+" : "−"}{format(Math.abs(diff))}</span>;
}

export function Comparison({ result, currency }: { result: SimulationResult; currency: string }) {
  const { current: c, proposed: p } = result;
  const money = (n: number) => formatMoney(n, currency);
  const rows: { label: string; render: (m: PlanMetrics) => React.ReactNode; delta: React.ReactNode }[] = [
    {
      label: "Projected completion",
      render: (m) => <span className="tabular">{formatShortDate(m.forecastFinish)}</span>,
      delta: c.forecastFinish === p.forecastFinish ? <span className="text-muted-foreground">No change</span> : <span className="tabular font-medium">{formatShortDate(c.forecastFinish)} → {formatShortDate(p.forecastFinish)}</span>,
    },
    {
      label: "Schedule variance",
      render: (m) => <span className={cn((m.slipWorkingDays ?? 0) > 0 && "text-critical")}>{slipText(m.slipWorkingDays)} <span className="text-xs text-muted-foreground">vs {formatShortDate(m.targetDate)}</span></span>,
      delta: <Delta before={c.slipWorkingDays} after={p.slipWorkingDays} lowerIsBetter format={(n) => `${n} wd`} />,
    },
    { label: "Projected cost (EAC)", render: (m) => <span className="tabular">{money(m.projectedCost)}</span>, delta: <Delta before={c.projectedCost} after={p.projectedCost} lowerIsBetter format={money} /> },
    {
      label: "Budget variance",
      render: (m) => <span className={cn("tabular", m.budgetVariance < 0 && "text-critical")}>{m.budget > 0 ? `${m.budgetVariance < 0 ? "−" : "+"}${money(Math.abs(m.budgetVariance))}` : "No budget"}</span>,
      delta: <Delta before={c.budgetVariance} after={p.budgetVariance} lowerIsBetter={false} format={money} />,
    },
    { label: "Remaining effort", render: (m) => <span className="tabular">{Math.round(m.remainingHours)} h</span>, delta: <Delta before={c.remainingHours} after={p.remainingHours} lowerIsBetter format={(n) => `${Math.round(n)} h`} /> },
    { label: "Tasks at risk", render: (m) => <span className="tabular">{m.tasksAtRisk}</span>, delta: <Delta before={c.tasksAtRisk} after={p.tasksAtRisk} lowerIsBetter format={String} /> },
    { label: "Health score", render: (m) => <HealthPill status={m.healthStatus} score={m.healthScore} />, delta: <Delta before={c.healthScore} after={p.healthScore} lowerIsBetter={false} format={String} /> },
  ];

  return (
    <div className="grid gap-6">
      <Panel title="Current plan vs proposed scenario" description="Both columns are computed by the same engine; only the proposed change differs" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="bg-subtle text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Measure</th>
                <th className="px-3 py-2 font-medium">Current plan</th>
                <th className="px-3 py-2 font-medium">Proposed scenario</th>
                <th className="px-4 py-2 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.label}</td>
                  <td className="px-3 py-2.5">{r.render(c)}</td>
                  <td className="px-3 py-2.5 font-medium">{r.render(p)}</td>
                  <td className="px-4 py-2.5 text-xs">{r.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {c.milestones.length > 0 && (
        <Panel title="Milestones" bodyClassName="p-0">
          <table className="w-full text-[13px]">
            <thead className="bg-subtle text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Milestone</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Current forecast</th>
                <th className="px-4 py-2 font-medium">Proposed forecast</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {c.milestones.map((m) => {
                const pm = p.milestones.find((x) => x.id === m.id);
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-2">{m.name}</td>
                    <td className="tabular px-3 py-2">{formatShortDate(pm?.due ?? m.due)}{pm && pm.due !== m.due && <span className="text-xs text-muted-foreground"> (was {formatShortDate(m.due)})</span>}</td>
                    <td className="px-3 py-2"><span className="tabular">{formatShortDate(m.forecast)}</span> <SlipPill slip={m.slip} /></td>
                    <td className="px-4 py-2"><span className="tabular">{formatShortDate(pm?.forecast)}</span> <SlipPill slip={pm?.slip ?? null} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="What “Apply” would change" description="Exact record updates — nothing has changed yet">
          <ul className="grid gap-1.5 text-[13px]">
            {result.changes.map((c) => <li key={c} className="font-mono text-xs leading-5">{c}</li>)}
          </ul>
          {result.affected.length > 0 && (
            <div className="mt-4">
              <SourceLabel>Dependencies and downstream effects</SourceLabel>
              <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">{result.affected.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
          <div className="mt-4">
            <SourceLabel>Other projects</SourceLabel>
            {result.portfolio.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No other project&apos;s forecast changes.</p>
            ) : (
              <ul className="mt-1 grid gap-1 text-xs">
                {result.portfolio.map((x) => (
                  <li key={x.projectId}>
                    {x.projectName}: {formatShortDate(x.before.finish)} → <span className="font-medium">{formatShortDate(x.after.finish)}</span> ({slipText(x.after.slip)})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
        <Panel title="Assumptions and limitations">
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
            {result.assumptions.map((a) => <li key={a}>{a}</li>)}
            <li>Projections are calculations from recorded capacity, estimates and rates — not predictions. No historical velocity is applied.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function SlipPill({ slip }: { slip: number | null }) {
  if (slip == null) return null;
  if (slip <= 0) return <span className="text-xs text-muted-foreground">on time</span>;
  return <Pill tone={slip >= 5 ? "critical" : "warning"}>{slip} wd late</Pill>;
}
