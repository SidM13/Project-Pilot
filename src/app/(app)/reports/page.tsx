import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { snapshot, analysis } = await getAnalysis();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const projects = [...analysis.projects].sort((a, b) => a.health.score - b.health.score).map((p) => ({ id: p.project.id, name: p.project.name }));
  const projectId = projects.find((p) => p.id === one(sp.project))?.id ?? projects[0]?.id;
  const [briefs, simulations] = await Promise.all([getBriefs(snapshot.workspace.id), projectId ? getSimulations(projectId) : Promise.resolve([])]);
  const names = new Map(snapshot.projects.map((p) => [p.id, p.name]));
  const requestedSim = one(sp.simulation) ?? "";

  return (
    <>
      <PageHeader
        eyebrow={snapshot.workspace.name}
        title="Decision briefs"
        description="Executive-ready briefs that separate calculated facts from AI-drafted narrative. Review, edit, copy or export each one."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel title="New brief">
          {projectId ? (
            <BriefGenerator
              key={projectId}
              projects={projects}
              simulations={simulations.map((s) => ({ id: s.id, name: s.name, status: s.status }))}
              projectId={projectId}
              simulationId={simulations.some((s) => s.id === requestedSim) ? requestedSim : ""}
              aiConfigured={isAiConfigured()}
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
                    <td className="max-w-[340px] px-4 py-2"><Link href={`/reports/${b.id}`} className="block truncate font-medium hover:underline underline-offset-2">{b.title}</Link></td>
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
