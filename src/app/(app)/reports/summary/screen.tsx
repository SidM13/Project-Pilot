import Link from "next/link";
import { getAnalysis } from "@/lib/data/analysis";
import { answerQuery } from "@/lib/engine/copilot";
import { formatDate, formatMoney, formatShortDate } from "@/lib/format";
import { METHODOLOGY_LABELS } from "@/lib/types";
import { PrintButton } from "@/components/reports/print-button";
import { SourceLabel } from "@/components/system/states";
import { HealthPill } from "@/components/system/status";

// Portfolio status summary: a printable one-pager built only from engine output.
export async function loadSummary() {
  const { snapshot, analysis } = await getAnalysis();
  return { snapshot, analysis, weekly: answerQuery(snapshot, { intent: "weekly_summary" }, analysis.referenceDate) };
}

export function SummaryView({ snapshot, analysis, weekly }: Awaited<ReturnType<typeof loadSummary>>) {
  const money = (n: number) => formatMoney(n, snapshot.workspace.currency);
  const m = analysis.metrics;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-muted-foreground">
          <Link href="/reports" className="hover:text-foreground hover:underline">Reports</Link> / Portfolio status summary
        </p>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[880px] rounded-lg border bg-card px-6 py-8 sm:px-10 print:max-w-none print:border-0 print:p-0">
        <header className="border-b pb-5">
          <SourceLabel>Portfolio status summary</SourceLabel>
          <h1 className="mt-1 font-serif text-[26px] leading-tight font-semibold tracking-tight">{snapshot.workspace.name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">As of {formatDate(analysis.referenceDate)} · {m.activeProjects} active projects · calculated from project records</p>
          <p className="mt-4 text-[14px] leading-6">{weekly.headline}</p>
        </header>

        <section className="mt-6">
          <h2 className="text-[13px] font-semibold">Projects</h2>
          <table className="mt-2 w-full text-[12.5px]">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 pr-2 font-medium">Project</th>
                <th className="py-1.5 pr-2 font-medium">Health</th>
                <th className="py-1.5 pr-2 text-right font-medium">Progress</th>
                <th className="py-1.5 pr-2 font-medium">Target → forecast</th>
                <th className="py-1.5 text-right font-medium">Projected vs budget</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...analysis.projects].sort((a, b) => a.health.score - b.health.score).map((p) => {
                const slip = p.forecastFinish?.slipWorkingDays ?? null;
                return (
                  <tr key={p.project.id} className="align-top">
                    <td className="py-2 pr-2">
                      <span className="font-medium">{p.project.name}</span>
                      <span className="block text-xs text-muted-foreground">{METHODOLOGY_LABELS[p.project.methodology]}{p.project.client_name ? ` · ${p.project.client_name}` : ""}</span>
                    </td>
                    <td className="py-2 pr-2"><HealthPill status={p.health.status} score={p.health.score} /></td>
                    <td className="tabular py-2 pr-2 text-right">{p.progress.percent}%</td>
                    <td className="tabular py-2 pr-2">
                      {formatShortDate(p.project.target_date)} → {p.forecastFinish?.finish ? formatShortDate(p.forecastFinish.finish) : p.forecastFinish ? "unknown" : "done"}
                      {slip !== null && slip > 0 && <span className="block text-xs text-critical">{slip} working days late</span>}
                    </td>
                    <td className="tabular py-2 text-right">
                      {money(p.cost.estimateAtCompletion)} / {money(p.cost.budget)}
                      {p.cost.budget > 0 && <span className={p.cost.variance < 0 ? "block text-xs text-critical" : "block text-xs text-muted-foreground"}>{p.cost.variance < 0 ? `${money(-p.cost.variance)} over` : `${money(p.cost.variance)} under`}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            {m.overdueMilestones} overdue milestone(s) · {m.criticalDeadlines} milestone(s) or critical task(s) due in the next 14 days · forecast overrun across the portfolio {money(m.budgetExposure)}
          </p>
        </section>

        {analysis.decisions.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[13px] font-semibold">Decisions needed</h2>
            <ol className="mt-2 grid gap-3">
              {analysis.decisions.slice(0, 5).map((d, i) => (
                <li key={d.id} className="grid gap-0.5 text-[12.5px] leading-5">
                  <span className="font-medium">{i + 1}. {d.projectName}: {d.problem}</span>
                  {d.impact && <span className="text-muted-foreground">{d.impact.label}</span>}
                  <span><span className="text-muted-foreground">Recommended (rule-based): </span>{d.action}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mt-6 border-t pt-4">
          <SourceLabel>Assumptions</SourceLabel>
          <ul className="mt-1.5 grid list-disc gap-1 pl-4 text-[11.5px] leading-4 text-muted-foreground">
            {weekly.assumptions.map((a) => <li key={a}>{a}</li>)}
            <li>Forecasts are calculations from recorded capacity, estimates and rates, not predictions. Costs to complete cover labor only.</li>
          </ul>
        </section>
      </article>
    </>
  );
}
