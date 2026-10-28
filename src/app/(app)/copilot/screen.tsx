import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import { getAnalysis } from "@/lib/data/analysis";
import { isAiConfigured } from "@/lib/ai";
import { formatWeekdayDate } from "@/lib/format";
import { Copilot, type AiMode } from "@/components/copilot/copilot";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { EmptyState, SourceLabel } from "@/components/system/states";

export type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function loadCopilot(sp: SearchParams) {
  const { snapshot, analysis } = await getAnalysis();
  const aiMode: AiMode = process.env.NEXT_PUBLIC_STATIC_DEMO === "1" ? "demo_off" : isAiConfigured() ? "live" : "not_configured";
  return { snapshot, analysis, aiMode, initialQuestion: one(sp.q)?.slice(0, 500) };
}

export function CopilotView({ snapshot, analysis, aiMode, initialQuestion }: Awaited<ReturnType<typeof loadCopilot>>) {
  const projects = [...analysis.projects].sort((a, b) => a.health.score - b.health.score);
  const names = new Map(projects.map((p) => [p.project.id, p.project.name]));
  const milestones = projects.flatMap((p) =>
    p.facts.milestones
      .filter((m) => !m.completed_at)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((m) => ({ id: m.id, name: m.name, projectName: names.get(p.project.id)! })),
  );

  return (
    <>
      <PageHeader
        eyebrow={`${snapshot.workspace.name} · as of ${formatWeekdayDate(analysis.referenceDate)}`}
        title="AI Copilot"
        description="Ask about deadlines, budget, workload and what-ifs across every project. Answers are calculated from your records first; Gemini then explains them in plain language."
      />
      {projects.length === 0 ? (
        <EmptyState title="No active projects yet" description="The Copilot answers from your project records. Create a project and add a few tasks first." />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Copilot
            key={initialQuestion ?? "copilot"}
            projects={projects.map((p) => ({ id: p.project.id, name: p.project.name }))}
            milestones={milestones}
            initialQuestion={initialQuestion}
            aiMode={aiMode}
          />
          <div className="grid gap-4 xl:sticky xl:top-6">
            <Panel title="What-if planner" description="Test a change on a copy of the plan before you commit to it.">
              <div className="grid gap-3">
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  <li>· Reassign a task to someone else</li>
                  <li>· Move a milestone or the target date</li>
                  <li>· Defer non-critical scope</li>
                </ul>
                <Link href="/simulator" className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-input bg-card px-3 text-[13px] font-medium hover:bg-muted">
                  <FlaskConical className="size-4" /> Open planner
                </Link>
              </div>
            </Panel>
            <Panel title="How answers are built">
              <ol className="grid gap-2.5 text-xs leading-5">
                <li><SourceLabel>1 · Confirmed facts</SourceLabel><p className="text-muted-foreground">Tasks, hours, owners, dates and spend you recorded.</p></li>
                <li><SourceLabel>2 · Forecasts</SourceLabel><p className="text-muted-foreground">Deterministic calculations — finish dates, cost to complete, workload — using documented rules.</p></li>
                <li><SourceLabel>3 · Assumptions</SourceLabel><p className="text-muted-foreground">What each calculation takes for granted, stated every time.</p></li>
                <li><SourceLabel>4 · AI draft</SourceLabel><p className="text-muted-foreground">Gemini explains steps 1–3. Any number it writes that is not in the calculation is rejected.</p></li>
              </ol>
            </Panel>
            <Link href="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Need a document? Generate a report <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
