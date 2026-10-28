import { getAnalysis } from "@/lib/data/analysis";
import { getSimulations } from "@/lib/data/simulations";
import { isAiConfigured } from "@/lib/ai";
import { formatWeekdayDate } from "@/lib/format";
import Link from "next/link";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/states";
import { Simulator } from "@/components/simulator/simulator";


export type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function loadSimulator(sp: SearchParams) {
  const { snapshot, analysis } = await getAnalysis();
  const ranked = [...analysis.projects].sort((a, b) => a.health.score - b.health.score);
  const projectId = ranked.find((p) => p.project.id === one(sp.project))?.project.id ?? ranked[0]?.project.id ?? null;
  return {
    snapshot,
    analysis,
    ranked,
    projectId,
    saved: projectId ? await getSimulations(projectId) : [],
    initial: { kind: one(sp.kind), task: one(sp.task), to: one(sp.to) },
    aiConfigured: isAiConfigured(),
  };
}

export function SimulatorView({ snapshot, analysis, ranked, projectId, saved, initial, aiConfigured }: Awaited<ReturnType<typeof loadSimulator>>) {

  if (!projectId) {
    return (
      <>
        <PageHeader title="What-if planner" eyebrow={<Link href="/copilot" className="hover:text-foreground hover:underline">AI Copilot</Link>} />
        <EmptyState title="No active projects to simulate" description="Create a project with tasks, owners and dates first." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={<><Link href="/copilot" className="hover:text-foreground hover:underline">AI Copilot</Link> / as of {formatWeekdayDate(analysis.referenceDate)}</>}
        title="What-if planner"
        description="Try a change — reassign work, move a date or defer scope — on a copy of the plan, and compare it with today's plan. Nothing changes until you approve it."
      />
      <Simulator
        key={projectId}
        snapshot={snapshot}
        projectId={projectId}
        projects={ranked.map((p) => ({ id: p.project.id, name: p.project.name }))}
        saved={saved}
        initial={initial}
        aiConfigured={aiConfigured}
      />
    </>
  );
}
