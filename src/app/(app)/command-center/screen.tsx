import Link from "next/link";
import { getAnalysis } from "@/lib/data/analysis";
import { formatMoney, formatWeekdayDate } from "@/lib/format";
import { DecisionCard } from "@/components/command-center/decision-card";
import { PortfolioHealth, TeamLoad, UpcomingDeadlines } from "@/components/command-center/side-panels";
import { MetricStrip } from "@/components/system/metric-strip";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { EmptyState } from "@/components/system/states";
import { NewProjectButton } from "@/components/projects/project-form";


export async function loadCommandCenter() {
  return getAnalysis();
}

export function CommandCenterView({ snapshot, analysis }: Awaited<ReturnType<typeof loadCommandCenter>>) {
  const { metrics, decisions } = analysis;
  const currency = snapshot.workspace.currency;

  if (analysis.projects.length === 0) {
    return (
      <>
        <PageHeader title="Command Center" eyebrow={snapshot.workspace.name} />
        <EmptyState
          title="No active projects yet"
          description="Create a project, add its tasks with planned hours, owners and dates, and record spend. Decisions appear here as soon as the data shows something worth acting on."
          action={<NewProjectButton members={snapshot.members} />}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${snapshot.workspace.name} · as of ${formatWeekdayDate(analysis.referenceDate)}`}
        title="Command Center"
        description="Decisions ranked by severity across every active project. Each one shows the records it was calculated from."
      />

      <MetricStrip
        className="mb-6"
        metrics={[
          { label: "Active projects", value: metrics.activeProjects },
          { label: "Needing intervention", value: metrics.needingIntervention, tone: metrics.needingIntervention ? "warning" : "default", detail: "At risk or critical health" },
          { label: "Overdue milestones", value: metrics.overdueMilestones, tone: metrics.overdueMilestones ? "critical" : "default" },
          { label: "Budget exposure", value: formatMoney(metrics.budgetExposure, currency), tone: metrics.budgetExposure > 0 ? "critical" : "default", detail: "Forecast overrun at completion" },
          { label: "Critical deadlines", value: metrics.criticalDeadlines, detail: "Due in the next 14 days" },
        ]}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Decisions requiring attention"
          description={`${decisions.length} decision${decisions.length === 1 ? "" : "s"} · ranked by severity, then type`}
          bodyClassName="p-0"
        >
          {decisions.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">No decisions are needed right now. Findings below high severity are listed on each project.</p>
          ) : (
            <div className="divide-y">
              {decisions.map((d, i) => (
                <DecisionCard key={d.id} decision={d} rank={i + 1} />
              ))}
            </div>
          )}
        </Panel>

        <div className="grid gap-6">
          <PortfolioHealth projects={analysis.projects} />
          <UpcomingDeadlines analysis={analysis} />
          <TeamLoad loads={analysis.loads} window={analysis.window} />
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Every figure on this page is calculated from project records using documented rules. No AI model is involved.{" "}
        <Link href="/projects" className="text-primary hover:underline">View all projects</Link>
      </p>
    </>
  );
}
