import { getProjectView } from "@/lib/data/project";
import { DeferredTasks } from "@/components/projects/deferred-tasks";
import { TaskTable } from "@/components/projects/task-table";

export async function loadProjectTasks(id: string) {
  return getProjectView(id);
}

export function ProjectTasksView({ project, facts, snapshot, referenceDate, findings }: Awaited<ReturnType<typeof loadProjectTasks>>) {
  const order = { blocked: 0, in_progress: 1, todo: 2, done: 3 } as const;
  const tasks = [...facts.tasks].sort((a, b) => order[a.status] - order[b.status] || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
  const deferred = snapshot.tasks.filter((t) => t.project_id === project.id && t.deferred_at);
  return (
    <>
      <TaskTable
        projectId={project.id}
        tasks={tasks}
        dependencies={facts.dependencies}
        members={snapshot.members}
        milestones={facts.milestones}
        referenceDate={referenceDate}
        flaggedTaskIds={[...new Set(findings.flatMap((f) => f.taskIds))]}
      />
      <DeferredTasks tasks={deferred} />
    </>
  );
}
