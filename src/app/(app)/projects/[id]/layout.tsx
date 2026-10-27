import { Suspense } from "react";
import Link from "next/link";
import { getProjectView } from "@/lib/data/project";
import { formatDate } from "@/lib/format";
import { PROJECT_STATUS_LABELS } from "@/lib/types";
import { ArchiveButton } from "@/components/projects/archive-button";
import { EditProjectButton } from "@/components/projects/project-form";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { HealthPill, Pill } from "@/components/system/status";
import { Skeleton } from "@/components/system/states";

async function ProjectHeader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, health, snapshot, memberById } = await getProjectView(id);
  const owner = project.owner_member_id ? memberById.get(project.owner_member_id)?.name : null;
  return (
    <>
      <div className="mb-1 text-xs text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground hover:underline">Projects</Link>
        <span aria-hidden> / </span>
        <span>{project.client_name || "No client"}</span>
      </div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-[26px] leading-tight font-semibold tracking-tight">{project.name}</h1>
            <HealthPill status={health.status} score={health.score} />
            {project.archived_at ? <Pill>Archived — excluded from portfolio figures</Pill> : project.status !== "active" && <Pill>{PROJECT_STATUS_LABELS[project.status]}</Pill>}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Owner {owner ?? "unassigned"} · {formatDate(project.start_date)} → {formatDate(project.target_date)}
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

export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  return (
    <>
      <Suspense
        fallback={
          <div aria-busy="true">
            <Skeleton className="mb-2 h-3 w-40" />
            <Skeleton className="mb-6 h-7 w-80" />
            <Skeleton className="mb-6 h-6 w-96" />
          </div>
        }
      >
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}
