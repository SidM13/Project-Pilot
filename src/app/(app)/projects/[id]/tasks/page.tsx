import { loadProjectTasks, ProjectTasksView } from "./screen";

export default async function ProjectTasksPage({ params }: PageProps<"/projects/[id]/tasks">) {
  return <ProjectTasksView {...await loadProjectTasks((await params).id)} />;
}
