import { loadProjectMilestones, ProjectMilestonesView } from "./screen";

export default async function ProjectMilestonesPage({ params }: PageProps<"/projects/[id]/milestones">) {
  return <ProjectMilestonesView {...await loadProjectMilestones((await params).id)} />;
}
