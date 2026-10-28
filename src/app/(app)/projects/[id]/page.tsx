import { loadProjectOverview, ProjectOverviewView } from "./screen";

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[id]">) {
  return <ProjectOverviewView {...await loadProjectOverview((await params).id)} />;
}
