import { getProjectView } from "@/lib/data/project";
import { DeferredTasks } from "@/components/projects/deferred-tasks";
import { TaskWorkspace } from "@/components/projects/task-workspace";

export async function loadProjectTasks(id: string) {
  return getProjectView(id);
}

export function ProjectTasksView({ project, facts, snapshot, referenceDate, findings, sprints, agile, criticalPath }: Awaited<ReturnType<typeof loadProjectTasks>>) {
  const deferred = snapshot.tasks.filter((t) => t.project_id === project.id && t.deferred_at);
  return (
    <>
      <TaskWorkspace
        projectId={project.id}
        methodology={project.methodology}
        tasks={facts.tasks}
        dependencies={facts.dependencies}
        members={snapshot.members}
        milestones={facts.milestones}
        sprints={sprints}
        agile={agile}
        referenceDate={referenceDate}
        flaggedTaskIds={[...new Set(findings.flatMap((f) => f.taskIds))]}
        criticalPathIds={criticalPath.taskIds}
      />
      <DeferredTasks tasks={deferred} />
    </>
  );
}
