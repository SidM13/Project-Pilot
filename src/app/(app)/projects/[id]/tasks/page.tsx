import { getProjectView } from "@/lib/data/project";
import { TaskTable } from "@/components/projects/task-table";

export default async function ProjectTasksPage({ params }: PageProps<"/projects/[id]/tasks">) {
  const { id } = await params;
  const { project, facts, snapshot, referenceDate, findings } = await getProjectView(id);
  const order = { blocked: 0, in_progress: 1, todo: 2, done: 3 } as const;
  const tasks = [...facts.tasks].sort((a, b) => order[a.status] - order[b.status] || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
  return (
    <TaskTable
      projectId={project.id}
      tasks={tasks}
      dependencies={facts.dependencies}
      members={snapshot.members}
      milestones={facts.milestones}
      referenceDate={referenceDate}
      flaggedTaskIds={[...new Set(findings.flatMap((f) => f.taskIds))]}
    />
  );
}
