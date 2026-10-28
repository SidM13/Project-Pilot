import Link from "next/link";
import { RULE_CATEGORY, SEVERITY_ORDER, type FindingCategory } from "@/lib/engine/findings";
import { isOpen, remainingHours } from "@/lib/engine/progress";
import { getAnalysis } from "@/lib/data/analysis";
import { getRiskHistory, recordRiskSnapshots } from "@/lib/data/risk-history";
import { formatDateTime, formatMoney, formatShortDate } from "@/lib/format";
import { ForecastTimeline } from "@/components/risk/forecast-timeline";
import { EvidenceList } from "@/components/system/evidence-list";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { EmptyState, SourceLabel } from "@/components/system/states";
import { HEALTH_LABEL, HealthPill, Pill, SeverityPill } from "@/components/system/status";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/routes";


const CATEGORY_LABEL: Record<FindingCategory, string> = { schedule: "Schedule", budget: "Budget", resources: "Resources" };

export type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function loadRisk(sp: SearchParams) {
  const { snapshot, analysis } = await getAnalysis();
  const ranked = [...analysis.projects].sort((a, b) => a.health.score - b.health.score);
  const selected = ranked.find((p) => p.project.id === one(sp.project)) ?? ranked[0] ?? null;
  if (!selected) return { snapshot, analysis, ranked, selected, history: [] };
  // First view after any change establishes a history point (no-op when nothing changed).
  await recordRiskSnapshots(snapshot.workspace.id, analysis);
  return { snapshot, analysis, ranked, selected, history: await getRiskHistory(selected.project.id) };
}

export function RiskView({ snapshot, analysis, ranked, selected, history }: Awaited<ReturnType<typeof loadRisk>>) {
  const currency = snapshot.workspace.currency;
  if (!selected) {
    return (
      <>
        <PageHeader title="Risk Intelligence" eyebrow={snapshot.workspace.name} />
        <EmptyState title="No active projects to analyse" description="Risk findings and forecasts appear once a project has tasks with owners, hours and dates." />
      </>
    );
  }

  const { project, facts, findings, health, cost } = selected;
  const pf = analysis.forecast.projects.get(project.id);
  const members = new Map(snapshot.members.map((m) => [m.id, m]));
  const openTasks = facts.tasks.filter(isOpen);
  const team = new Set(openTasks.flatMap((t) => (t.assignee_id ? [t.assignee_id] : [])));
  const openMilestones = facts.milestones.filter((m) => !m.completed_at).sort((a, b) => a.due_date.localeCompare(b.due_date));

  const facts_rows: [string, string][] = [
    ["Open tasks", `${openTasks.length} of ${facts.tasks.length}`],
    ["Blocked", String(openTasks.filter((t) => t.status === "blocked").length)],
    ["Overdue", String(openTasks.filter((t) => t.due_date && t.due_date < analysis.referenceDate).length)],
    ["Remaining effort", `${Math.round(openTasks.reduce((s, t) => s + remainingHours(t), 0))} h`],
    ["Open dependencies", String(facts.dependencies.filter((d) => openTasks.some((t) => t.id === d.task_id)).length)],
    ["People on open work", String(team.size)],
    ["Budget", formatMoney(project.budget, currency)],
    ["Spent to date", formatMoney(cost.actualCost, currency)],
    ["Target date", formatShortDate(project.target_date)],
  ];

  return (
    <>
      <PageHeader
        eyebrow={`${snapshot.workspace.name} · as of ${formatShortDate(analysis.referenceDate)}`}
        title="Risk Intelligence"
        description="Facts from project records, findings from explicit rules, and a capacity-aware forecast. Every figure links back to the records and rules that produced it."
      />

      <div className="mb-6 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="bg-subtle text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Health</th>
              <th className="px-3 py-2 font-medium">Forecast finish</th>
              <th className="px-3 py-2 text-right font-medium">vs target</th>
              <th className="px-3 py-2 font-medium">Findings</th>
              <th className="px-3 py-2 text-right font-medium">Budget variance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ranked.map((p) => {
              const f = analysis.forecast.projects.get(p.project.id);
              const counts = SEVERITY_ORDER.map((s) => [s, p.findings.filter((x) => x.severity === s).length] as const).filter(([, n]) => n);
              const active = p.project.id === project.id;
              return (
                <tr key={p.project.id} className={cn("hover:bg-subtle", active && "bg-info-soft hover:bg-info-soft")}>
                  <td className="px-4 py-2">
                    <Link href={`/risk?project=${p.project.id}`} aria-current={active ? "true" : undefined} className="font-medium hover:underline underline-offset-2">{p.project.name}</Link>
                  </td>
                  <td className="px-3 py-2"><HealthPill status={p.health.status} score={p.health.score} /></td>
                  <td className="tabular px-3 py-2">{f?.finish ? formatShortDate(f.finish) : "—"}</td>
                  <td className={cn("tabular px-3 py-2 text-right", (f?.slipWorkingDays ?? 0) > 0 && "font-medium text-critical")}>
                    {f?.slipWorkingDays == null ? "—" : f.slipWorkingDays > 0 ? `${f.slipWorkingDays} wd late` : f.slipWorkingDays === 0 ? "On target" : `${-f.slipWorkingDays} wd early`}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{counts.length ? counts.map(([s, n]) => `${n} ${s}`).join(" · ") : "None"}</td>
                  <td className={cn("tabular px-3 py-2 text-right", p.cost.variance < 0 && "text-critical")}>
                    {p.cost.budget > 0 ? `${p.cost.variance < 0 ? "−" : "+"}${formatMoney(Math.abs(p.cost.variance), currency)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold tracking-tight">{project.name}</h2>
        <Link href={projectHref(project.id)} className="text-xs font-medium text-primary hover:underline">Open project workspace</Link>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Panel title={<SourceLabel>1 · Facts from records</SourceLabel>} bodyClassName="p-0">
          <dl className="divide-y text-[13px]">
            {facts_rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel
          title={<SourceLabel>2 · Calculated findings</SourceLabel>}
          description={`Health ${health.score}/100 (${HEALTH_LABEL[health.status]}) = 100 − ${health.penalties.map((p) => `${p.points} ${p.category}`).join(" − ") || "0"}`}
          bodyClassName="p-0"
        >
          {findings.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Every rule passes for this project.</p>
          ) : (
            (Object.keys(CATEGORY_LABEL) as FindingCategory[]).map((c) => {
              const own = findings.filter((f) => RULE_CATEGORY[f.rule] === c);
              if (!own.length) return null;
              const penalty = health.penalties.find((p) => p.category === c);
              return (
                <section key={c} className="border-b last:border-b-0">
                  <h3 className="flex justify-between bg-subtle px-4 py-1.5 text-xs font-medium">
                    <span>{CATEGORY_LABEL[c]}</span>
                    <span className="tabular text-muted-foreground">−{penalty?.points ?? 0}{penalty && penalty.rawPoints > penalty.points ? ` (capped from ${penalty.rawPoints})` : ""}</span>
                  </h3>
                  <ul className="divide-y">
                    {own.map((f) => (
                      <li key={f.id} className="grid gap-1.5 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityPill severity={f.severity} />
                          <span className="text-[13px] font-medium">{f.title}</span>
                          <code className="ml-auto font-mono text-[10px] text-muted-foreground">{f.rule}</code>
                        </div>
                        {f.impact && <p className="text-xs text-foreground/80">{f.impact.label}</p>}
                        <EvidenceList evidence={f.evidence} projectId={project.id} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </Panel>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title={<SourceLabel>3 · Capacity forecast</SourceLabel>}
          description={pf?.finish ? `Forecast finish ${formatShortDate(pf.finish)} vs target ${formatShortDate(project.target_date)}` : "Some work cannot be scheduled with current capacity"}
        >
          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1.5 font-medium">Milestone</th>
                  <th className="py-1.5 font-medium">Due</th>
                  <th className="py-1.5 font-medium">Forecast</th>
                  <th className="py-1.5 text-right font-medium">Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {openMilestones.map((m) => {
                  const mf = analysis.forecast.milestones.get(m.id);
                  const slip = mf?.slipWorkingDays;
                  return (
                    <tr key={m.id}>
                      <td className="py-1.5">{m.name}</td>
                      <td className="tabular py-1.5">{formatShortDate(m.due_date)}</td>
                      <td className="tabular py-1.5">{mf?.finish ? formatShortDate(mf.finish) : mf?.drivingTaskId ? "Unknown" : "No open work"}</td>
                      <td className="py-1.5 text-right">{slip == null ? "—" : slip > 0 ? <Pill tone={slip >= 5 ? "critical" : "warning"}>{slip} wd late</Pill> : <span className="text-xs text-muted-foreground">On time</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ForecastTimeline tasks={openTasks} forecast={analysis.forecast} members={members} referenceDate={analysis.referenceDate} target={project.target_date} />
          <div className="mt-4 rounded-md border bg-subtle px-3 py-2.5">
            <SourceLabel>Assumptions and limits</SourceLabel>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {analysis.forecast.assumptions.map((a) => <li key={a}>{a}</li>)}
              <li>Public holidays and leave are not modelled.</li>
            </ul>
          </div>
        </Panel>

        <Panel title="Risk history" description="Recorded whenever the calculated result changes" bodyClassName="p-0">
          {history.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">History starts with the next change to this project.</p>
          ) : (
            <ol className="divide-y">
              {history.map((h, i) => {
                const prev = history[i + 1];
                const added = prev ? h.findings.filter((f) => !prev.findings.some((p) => p.id === f.id)) : [];
                const resolved = prev ? prev.findings.filter((f) => !h.findings.some((p) => p.id === f.id)) : [];
                const delta = prev ? h.health_score - prev.health_score : null;
                return (
                  <li key={h.id} className="grid gap-1 px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tabular font-mono text-[11px] text-muted-foreground">{formatDateTime(h.created_at)}</span>
                      <span className="flex items-center gap-2">
                        {delta !== null && delta !== 0 && <span className={cn("tabular text-xs", delta > 0 ? "text-healthy" : "text-critical")}>{delta > 0 ? "+" : "−"}{Math.abs(delta)}</span>}
                        <HealthPill status={h.health_status} score={h.health_score} />
                      </span>
                    </div>
                    {!prev && <p className="text-xs text-muted-foreground">Baseline · {h.findings.length} finding{h.findings.length === 1 ? "" : "s"}</p>}
                    {added.map((f) => <p key={f.id} className="text-xs"><span className="text-critical">+</span> {f.title}</p>)}
                    {resolved.map((f) => <p key={f.id} className="text-xs text-muted-foreground"><span className="text-healthy">−</span> {f.title}</p>)}
                    {prev && !added.length && !resolved.length && <p className="text-xs text-muted-foreground">Same findings; figures changed{h.forecast_finish !== prev.forecast_finish ? ` (forecast ${formatShortDate(prev.forecast_finish)} → ${formatShortDate(h.forecast_finish)})` : ""}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
