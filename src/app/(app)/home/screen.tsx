import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAnalysis } from "@/lib/data/analysis";
import { formatMoney, formatWeekdayDate } from "@/lib/format";
import { DecisionCard } from "@/components/command-center/decision-card";
import { TeamLoad, UpcomingDeadlines } from "@/components/command-center/side-panels";
import { AskBar } from "@/components/copilot/ask-bar";
import { BudgetWatch, ProjectsOverview } from "@/components/home/panels";
import { MetricStrip } from "@/components/system/metric-strip";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { EmptyState } from "@/components/system/states";
import { NewProjectButton } from "@/components/projects/project-form";

/** Decisions shown before "Show all": the rest are one click away (progressive disclosure). */
const ATTENTION_PREVIEW = 3;

export async function loadHome() {
  return getAnalysis();
}

export function HomeView({ snapshot, analysis }: Awaited<ReturnType<typeof loadHome>>) {
  const { metrics, decisions } = analysis;
  const currency = snapshot.workspace.currency;
  const eyebrow = `${formatWeekdayDate(analysis.referenceDate)} · ${snapshot.workspace.name}`;

  if (analysis.projects.length === 0) {
    return (
      <>
        <PageHeader title="Home" eyebrow={eyebrow} />
        <EmptyState
          title="Start with your first project"
          description="Choose Waterfall or Agile, add a few tasks with owners, hours and dates, and ProjectPilot will forecast your finish date, budget and team workload."
          action={<NewProjectButton members={snapshot.members} />}
        />
      </>
    );
  }

  const shown = decisions.slice(0, ATTENTION_PREVIEW);
  const hidden = decisions.slice(ATTENTION_PREVIEW);

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title="Home"
        description="What needs your attention across every active project, calculated from your records."
        actions={<NewProjectButton members={snapshot.members} />}
      />

      <AskBar className="mb-6" />

      <MetricStrip
        className="mb-6"
        metrics={[
          { label: "Active projects", value: metrics.activeProjects },
          { label: "Need attention", value: metrics.needingIntervention, tone: metrics.needingIntervention ? "warning" : "healthy", detail: "At risk or critical" },
          { label: "Due in 14 days", value: metrics.criticalDeadlines, detail: "Milestones and critical tasks" },
          { label: "Forecast overrun", value: formatMoney(metrics.budgetExposure, currency), tone: metrics.budgetExposure > 0 ? "critical" : "healthy", detail: "Across projects over budget" },
        ]}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-6">
          <Panel
            title="Needs your attention"
            description={decisions.length ? `${decisions.length} item${decisions.length === 1 ? "" : "s"}, most urgent first` : undefined}
            actions={
              <Link href="/risk" className="text-xs font-medium text-primary hover:underline">
                Full risk analysis
              </Link>
            }
            bodyClassName="p-0"
          >
            {decisions.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">Nothing needs a decision right now. Smaller findings are listed on each project.</p>
            ) : (
              <div className="divide-y">
                {shown.map((d, i) => (
                  <DecisionCard key={d.id} decision={d} rank={i + 1} defaultOpen={i === 0} />
                ))}
                {hidden.length > 0 && (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1 px-5 py-3 text-xs font-medium text-primary hover:bg-subtle [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Show {hidden.length} more</span>
                      <span className="hidden group-open:inline">Show fewer</span>
                    </summary>
                    <div className="divide-y border-t">
                      {hidden.map((d, i) => (
                        <DecisionCard key={d.id} decision={d} rank={ATTENTION_PREVIEW + i + 1} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </Panel>

          <ProjectsOverview projects={analysis.projects} />
        </div>

        <div className="grid gap-6">
          <UpcomingDeadlines analysis={analysis} />
          <BudgetWatch projects={analysis.projects} currency={currency} />
          <TeamLoad loads={analysis.loads} window={analysis.window} />
        </div>
      </div>

      <p className="mt-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        Every figure here is calculated from project records with documented rules — no AI is involved.
        <Link href="/copilot" className="inline-flex items-center gap-0.5 text-primary hover:underline">
          Ask the AI Copilot to explain <ArrowRight className="size-3" />
        </Link>
      </p>
    </>
  );
}
