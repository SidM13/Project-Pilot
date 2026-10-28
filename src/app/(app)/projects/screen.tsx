import Link from "next/link";
import { analyzeProject, isLiveProject } from "@/lib/engine";
import { getAnalysis } from "@/lib/data/analysis";
import { formatDate, formatMoney, formatSigned } from "@/lib/format";
import { PROJECT_STATUS_LABELS } from "@/lib/types";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/states";
import { HealthPill, Pill } from "@/components/system/status";
import { NewProjectButton } from "@/components/projects/project-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/routes";


export type SearchParams = Record<string, string | string[] | undefined>;

export async function loadProjects(sp: SearchParams) {
  return { view: sp.view === "archived" ? ("archived" as const) : ("active" as const), ...(await getAnalysis()) };
}

export function ProjectsView({ view, snapshot, analysis }: Awaited<ReturnType<typeof loadProjects>>) {
  const members = new Map(snapshot.members.map((m) => [m.id, m.name]));
  const currency = snapshot.workspace.currency;
  const archivedCount = snapshot.projects.filter((p) => !isLiveProject(p)).length;

  const rows =
    view === "active"
      ? analysis.projects
      : snapshot.projects.filter((p) => !isLiveProject(p)).map((p) => analyzeProject(snapshot, p.id)!);

  return (
    <>
      <PageHeader title="Projects" eyebrow={snapshot.workspace.name} actions={<NewProjectButton members={snapshot.members} />} />

      <div className="mb-3 flex gap-1 text-[13px]" role="tablist" aria-label="Project filter">
        {(["active", "archived"] as const).map((v) => (
          <Link
            key={v}
            href={v === "active" ? "/projects" : "/projects?view=archived"}
            role="tab"
            aria-selected={view === v}
            className={cn("rounded-md px-2.5 py-1", view === v ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground")}
          >
            {v === "active" ? `Active (${analysis.projects.length})` : `Archived & completed (${archivedCount})`}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={view === "active" ? "No active projects" : "Nothing archived"}
          description={view === "active" ? "Create a project to start tracking schedule, budget and risk." : "Archived and completed projects appear here with their records intact."}
          action={view === "active" ? <NewProjectButton members={snapshot.members} /> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-subtle text-xs">
                <TableHead>Project</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Progress</TableHead>
                <TableHead className="text-right">Schedule var.</TableHead>
                <TableHead className="text-right">Budget var.</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.project.id} className="text-[13px]">
                  <TableCell className="max-w-[320px]">
                    <Link href={projectHref(p.project.id)} className="block truncate font-medium hover:underline underline-offset-2">{p.project.name}</Link>
                    <span className="block truncate text-xs text-muted-foreground">{p.project.client_name || "No client"}</span>
                  </TableCell>
                  <TableCell>{p.project.owner_member_id ? members.get(p.project.owner_member_id) : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell><HealthPill status={p.health.status} score={p.health.score} /></TableCell>
                  <TableCell className="tabular text-right">{p.progress.percent}%</TableCell>
                  <TableCell className={cn("tabular text-right", p.schedule.variancePoints < -10 && "text-warning")}>{formatSigned(p.schedule.variancePoints, " pts")}</TableCell>
                  <TableCell className={cn("tabular text-right", p.cost.variance < 0 && "text-critical")}>
                    {p.cost.budget > 0 ? `${p.cost.variance < 0 ? "−" : "+"}${formatMoney(Math.abs(p.cost.variance), currency)}` : <span className="text-muted-foreground">No budget</span>}
                  </TableCell>
                  <TableCell className="tabular">{formatDate(p.project.target_date)}</TableCell>
                  <TableCell>
                    {p.project.archived_at ? <Pill>Archived</Pill> : <Pill>{PROJECT_STATUS_LABELS[p.project.status]}</Pill>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Schedule variance = % of planned effort complete − % of schedule elapsed. Budget variance = budget − forecast cost at completion.
      </p>
    </>
  );
}
