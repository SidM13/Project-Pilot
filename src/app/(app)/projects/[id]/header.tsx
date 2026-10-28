import Link from "next/link";
import { getProjectView } from "@/lib/data/project";
import { formatDate } from "@/lib/format";
import { METHODOLOGY_LABELS, PROJECT_STATUS_LABELS } from "@/lib/types";
import { ArchiveButton } from "@/components/projects/archive-button";
import { EditProjectButton } from "@/components/projects/project-form";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { HealthPill, Pill } from "@/components/system/status";

export async function loadProjectHeader(id: string) {
  return getProjectView(id);
}

export function ProjectHeaderView({ project, health, snapshot, memberById }: Awaited<ReturnType<typeof loadProjectHeader>>) {
  const owner = project.owner_member_id ? memberById.get(project.owner_member_id)?.name : null;
  return (
    <>
      <div className="mb-1 text-xs text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground hover:underline">Projects</Link>
        <span aria-hidden> / </span>
        <span>{project.name}</span>
      </div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-[26px] leading-tight font-semibold tracking-tight">{project.name}</h1>
            <HealthPill status={health.status} score={health.score} />
            <Pill>{METHODOLOGY_LABELS[project.methodology]}</Pill>
            {project.archived_at ? <Pill>Archived — excluded from portfolio figures</Pill> : project.status !== "active" && <Pill>{PROJECT_STATUS_LABELS[project.status]}</Pill>}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {project.client_name ? `${project.client_name} · ` : ""}Owner {owner ?? "unassigned"} · {formatDate(project.start_date)} → {formatDate(project.target_date)}
          </p>
        </div>
        <div className="flex gap-2">
          <EditProjectButton project={project} members={snapshot.members} />
          <ArchiveButton projectId={project.id} archived={!!project.archived_at} />
        </div>
      </div>
      <ProjectTabs projectId={project.id} />
    </>
  );
}
