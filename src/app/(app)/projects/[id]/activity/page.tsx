import { loadProjectActivity, ProjectActivityView } from "./screen";

export default async function ProjectActivityPage({ params }: PageProps<"/projects/[id]/activity">) {
  return <ProjectActivityView {...await loadProjectActivity((await params).id)} />;
}
