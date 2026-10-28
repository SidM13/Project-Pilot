import Link from "next/link";
import { isAiConfigured } from "@/lib/ai";
import { getAnalysis } from "@/lib/data/analysis";
import { getBriefs } from "@/lib/data/briefs";
import { getSimulations } from "@/lib/data/simulations";
import { formatDateTime } from "@/lib/format";
import { BriefGenerator } from "@/components/reports/brief-generator";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { EmptyState } from "@/components/system/states";
import { Pill } from "@/components/system/status";
import { briefHref } from "@/lib/routes";


export type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function loadReports(sp: SearchParams) {
  const { snapshot, analysis } = await getAnalysis();
  const projects = [...analysis.projects].sort((a, b) => a.health.score - b.health.score).map((p) => ({ id: p.project.id, name: p.project.name }));
  const projectId = projects.find((p) => p.id === one(sp.project))?.id ?? projects[0]?.id;
  const [briefs, simulations] = await Promise.all([getBriefs(snapshot.workspace.id), projectId ? getSimulations(projectId) : Promise.resolve([])]);
  return { snapshot, projects, projectId, briefs, simulations, requestedSim: one(sp.simulation) ?? "", aiConfigured: isAiConfigured() };
}

export function ReportsView({ snapshot, projects, projectId, briefs, simulations, requestedSim, aiConfigured }: Awaited<ReturnType<typeof loadReports>>) {
  const names = new Map(snapshot.projects.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader
        eyebrow={snapshot.workspace.name}
        title="Reports"
        description="Status summaries and executive briefs built from calculated figures. Review, edit, copy or download each one as a PDF."
      />
      <Link href="/reports/summary" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 hover:border-input hover:bg-subtle">
        <span>
          <span className="block text-[13.5px] font-medium">Portfolio status summary</span>
          <span className="block text-xs text-muted-foreground">One page covering every active project — health, forecast finish, budget and decisions needed. Ready to print or save as PDF.</span>
        </span>
        <span className="text-xs font-medium text-primary">Open summary →</span>
      </Link>
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Project briefs</h2>
      <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel title="New brief">
          {projectId ? (
            <BriefGenerator
              key={projectId}
              projects={projects}
              simulations={simulations.map((s) => ({ id: s.id, name: s.name, status: s.status }))}
              projectId={projectId}
              simulationId={simulations.some((s) => s.id === requestedSim) ? requestedSim : ""}
              aiConfigured={aiConfigured}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Create an active project first.</p>
          )}
        </Panel>

        {briefs.length === 0 ? (
          <EmptyState title="No briefs yet" description="Generate a brief for the project that needs a decision. It takes the current calculations — and optionally a simulated scenario — and drafts the narrative around them." />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-subtle text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Brief</th>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 font-medium">Narrative</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {briefs.map((b) => (
                  <tr key={b.id} className="hover:bg-subtle">
                    <td className="max-w-[340px] px-4 py-2"><Link href={briefHref(b.id)} className="block truncate font-medium hover:underline underline-offset-2">{b.title}</Link></td>
                    <td className="px-3 py-2">{names.get(b.project_id) ?? "—"}</td>
                    <td className="px-3 py-2">
                      {b.ai_meta.edited ? <Pill>Edited</Pill> : b.ai_meta.status === "drafted" ? <Pill tone="info">AI draft</Pill> : <Pill tone="warning">To write</Pill>}
                    </td>
                    <td className="tabular px-3 py-2 text-xs text-muted-foreground">{formatDateTime(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
